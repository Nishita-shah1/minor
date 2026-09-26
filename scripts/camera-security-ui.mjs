// Synthetic browser checks for the real camera hook. No Clerk account, document, or camera media leaves this local server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = String.raw`
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useCameraSecurity } from './hooks/use-camera-security';
import { CameraPreview } from './components/share/camera-preview';
function App() {
  const [selected, setSelected] = useState(null);
  const [locks, setLocks] = useState(0);
  const [opens, setOpens] = useState(0);
  const root = useRef(null);
  const camera = useCameraSecurity('11111111-1111-4111-8111-111111111111', () => { setSelected(null); setLocks(n => n + 1); }, () => setOpens(n => n + 1));
  return <>
    <button id="start" onClick={() => camera.start()}>Start</button>
    <button id="fullscreen" onClick={() => root.current.requestFullscreen()}>Fullscreen</button>
    <p id="status">{camera.status}</p><p id="error">{camera.error}</p><p id="provider">{camera.provider}</p><p id="locks">{locks}</p><p id="opens">{opens}</p>
    <div id="fullscreen-root" ref={root}>
      <button id="switch" onClick={() => setSelected(value => value === 'A' ? 'B' : 'A')}>Select another file</button>
      <button id="end" onClick={() => camera.stream?.getVideoTracks()[0].dispatchEvent(new Event('ended'))}>End track</button>
      {camera.stream && <CameraPreview stream={camera.stream} status={camera.status} />}
      {selected && camera.status === 'verified' && <p id="document">File {selected}</p>}
    </div>
  </>;
}
createRoot(document.getElementById('app')).render(<App />);
`;

const built = await build({ stdin: { contents: source, resolveDir: root, sourcefile: "camera-harness.tsx", loader: "tsx" },
  tsconfig: path.join(root, "tsconfig.json"), bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false });
const script = built.outputFiles[0].contents;
const workerBuilt = await build({ entryPoints: [path.join(root, "workers/yunet.worker.ts")], tsconfig: path.join(root, "tsconfig.json"),
  bundle: true, format: "esm", platform: "browser", write: false });
const workerScript = workerBuilt.outputFiles[0].contents;
const posted = [];
const server = createServer(async (request, response) => {
  if (request.url?.includes("/api/shares/") && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    posted.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(201, { "Content-Type": "application/json" }); response.end('{"recorded":true}'); return;
  }
  if (request.url === "/harness.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(script); return;
  }
  if (request.url === "/workers/yunet.worker.ts") {
    response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(workerScript); return;
  }
  if (request.url?.startsWith("/camera-assets/")) {
    try {
      const file = path.resolve(root, `public${request.url}`);
      if (!file.startsWith(path.join(root, "public/camera-assets/"))) throw new Error("Invalid asset path");
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".mjs") ? "text/javascript" : "application/octet-stream" });
      response.end(bytes); return;
    } catch { response.writeHead(404); response.end(); return; }
  }
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end('<html><body><div id="app"></div><script type="module" src="/harness.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

async function pageFor(mode = "success") {
  const context = await browser.newContext({ permissions: ["camera"] });
  await context.addInitScript(({ mode }) => {
    window.faceCount = 1;
    window.obscured = false;
    window.cameraRequests = 0;
    if (mode !== "real-worker") window.Worker = class {
      onmessage;
      onerror;
      postMessage(data) {
        queueMicrotask(() => this.onmessage?.({ data: { id: data.id,
          ...(mode === "model-error" && data.operation === "init" ? { error: "Model unavailable" } :
            { result: data.operation === "init" ? { provider: "wasm" } : { count: window.faceCount, obscured: window.obscured, provider: "wasm" } }) } }));
      }
      terminate() {}
    };
  }, { mode });
  const page = await context.newPage();
  await page.goto(address);
  await expect(page.locator("#start")).toBeVisible();
  await page.evaluate((mode) => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.cameraRequests++;
      if (mode === "permission-error") throw new Error("Permission denied");
      return original(constraints);
    };
  }, mode);
  return { page, context };
}

try {
  const denied = await pageFor("permission-error");
  await denied.page.locator("#start").click();
  await expect(denied.page.locator("#error")).toContainText("Permission denied");
  await expect(denied.page.locator("#status")).toHaveText("verifying");
  await expect(denied.page.locator("#document")).toHaveCount(0);
  await denied.context.close();

  const failedModel = await pageFor("model-error");
  await failedModel.page.locator("#start").click();
  await expect(failedModel.page.locator("#error")).toContainText("Model unavailable");
  await expect(failedModel.page.locator("#document")).toHaveCount(0);
  await failedModel.context.close();

  const live = await pageFor();
  await live.page.locator("#start").click();
  await expect(live.page.locator("#status")).toHaveText("verified", { timeout: 10000 });
  await live.page.locator("#switch").click();
  await expect(live.page.locator("#document")).toHaveText("File A");
  await live.page.locator("#switch").click();
  await expect(live.page.locator("#document")).toHaveText("File B");
  assert.equal(await live.page.evaluate(() => window.cameraRequests), 1);
  await live.page.locator("#fullscreen").click();
  await expect.poll(() => live.page.evaluate(() => document.fullscreenElement?.id), { timeout: 3000 }).toBe("fullscreen-root");
  await expect(live.page.locator('#fullscreen-root [aria-label="Your live camera preview"]')).toBeVisible();
  await live.page.evaluate(() => { window.faceCount = 0; });
  await expect(live.page.locator("#status")).toHaveText("blurred", { timeout: 4000 });
  await expect(live.page.locator("#document")).toHaveCount(0);
  await expect(live.page.locator("#status")).toHaveText("locked", { timeout: 4000 });
  await live.page.evaluate(() => { window.faceCount = 1; });
  await expect(live.page.locator("#status")).toHaveText("verified", { timeout: 4000 });
  await expect(live.page.locator("#document")).toHaveCount(0);
  await live.page.locator("#switch").click();
  await expect(live.page.locator("#document")).toBeVisible();
  await live.page.locator("#end").click();
  await expect(live.page.locator("#status")).toHaveText("locked");
  await expect(live.page.locator("#document")).toHaveCount(0);
  assert.equal(await live.page.evaluate(() => window.cameraRequests), 1);
  assert(posted.some(event => event.eventType === "FACE_VERIFIED"));
  assert(posted.some(event => event.eventType === "FACE_MISSING"));
  assert(posted.some(event => event.eventType === "CAMERA_LOST"));
  assert(posted.every(event => Object.keys(event).every(key => ["eventType", "sessionId", "durationMs"].includes(key))));
  await live.context.close();

  const real = await pageFor("real-worker");
  await real.page.locator("#start").click();
  await expect(real.page.locator("#provider")).toHaveText(/webgpu|wasm/, { timeout: 30000 });
  await real.page.waitForTimeout(1500);
  await expect(real.page.locator("#error")).toHaveText("");
  await real.context.close();
  console.log("PASS: permission/model failure, local three-check gate, one camera across files, fullscreen preview, missing-face blur/lock/recovery, track loss, event-only requests, pinned YuNet in a real browser worker.");
} finally {
  await browser.close();
  server.close();
}
