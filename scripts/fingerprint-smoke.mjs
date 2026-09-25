// Local developer smoke test, not the held-out qualification or a human review.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strength = Number(process.env.FINGERPRINT_STRENGTH ?? 1);
if (![0.8, 1, 1.25, 1.5].includes(strength)) throw new Error("Invalid tuning strength");
const output = path.join(root, "test-results/fingerprint-smoke", `strength-${strength}`);
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(root, "workers/fingerprint.worker.ts")], outfile: path.join(output, "worker.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2022", alias: { "@": root } });
const html = `<!doctype html><meta charset="utf-8"><title>Public TrustMark smoke fixture</title><canvas id="marked"></canvas><script>
const worker = new Worker('/worker.js', {type:'module'});
const waiting = new Map();
worker.onmessage = ({data}) => {
  if(data.id === null) { for(const p of waiting.values()) p.reject(new Error(data.error)); waiting.clear(); return; }
  const p=waiting.get(data.id); if(!p)return; waiting.delete(data.id);
  data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
};
window.exchange = (operation) => new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{waiting.delete(id);worker.terminate();reject(new Error('Worker operation timed out'));},180000);waiting.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});worker.postMessage({...operation,id});});
window.fixture = () => {
  const c=document.createElement('canvas');c.width=768;c.height=1024;
  const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,768,1024);
  x.fillStyle='#111';x.font='bold 32px sans-serif';x.fillText('PUBLIC TEST FIXTURE',48,70);
  x.font='18px sans-serif';for(let i=0;i<28;i++)x.fillText('Reference row '+(i+1)+' — amount '+(i*17.31).toFixed(2)+' — local pixels',48,125+i*28);
  x.fillStyle='#b7d8da';x.fillRect(48,930,672,36);
  return x.getImageData(0,0,768,1024);
};
</script>`;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
    let file;
    if (url.pathname === "/worker.js") file = path.join(output, "worker.js");
    else if (url.pathname.startsWith("/fingerprint-assets/")) {
      file = path.resolve(root, "public", `.${url.pathname}`);
      if (!file.startsWith(path.join(root, "public/fingerprint-assets") + path.sep)) throw new Error("Invalid path");
    } else { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", file.endsWith(".js") || file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const browserArgs = process.env.FINGERPRINT_VULKAN === "1"
  ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--disable-vulkan-surface"]
  : ["--enable-unsafe-webgpu"];
const report = { strength, browserArgs, kind: "tuning-smoke-only", qualified: false, runtime: null, cases: [], error: null };
try {
  browser = await chromium.launch({ channel: "chrome", headless: process.env.FINGERPRINT_HEADED !== "1", args: browserArgs });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  report.runtime = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return { browser: navigator.userAgent, adapter: adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null,
      shaderF16: adapter?.features.has("shader-f16") ?? false };
  });
  console.log("Runtime:", JSON.stringify(report.runtime));
  const clean = await page.evaluate(() => { const p=window.fixture();const c=document.createElement("canvas");c.width=p.width;c.height=p.height;c.getContext("2d").putImageData(p,0,0);return c.toDataURL("image/png").split(",")[1]; });
  await writeFile(path.join(output,"unmarked-fixture.png"),Buffer.from(clean,"base64"));
  const encodeStart=performance.now();
  await page.evaluate(async (strength) => {
    const source=window.fixture();
    const result=await window.exchange({operation:'encode',pixels:source,identifier:new Uint8Array([1,35,69,103,137]),strength});
    const c=document.querySelector('#marked');c.width=result.value.width;c.height=result.value.height;
    c.getContext('2d').putImageData(new ImageData(result.value.data,c.width,c.height),0,0);
  }, strength);
  report.encodeMs=performance.now()-encodeStart;
  const markedData = await page.evaluate(() => document.querySelector("#marked").toDataURL("image/png").split(",")[1]);
  await writeFile(path.join(output,"marked-pixels.png"),Buffer.from(markedData,"base64"));
  const screenshot = await page.locator("#marked").screenshot({ path: path.join(output, "marked-screenshot.png") });
  for (const [name, scale, jpeg] of [["native",1,false],["resize75",0.75,false],["resize50",0.5,false],["jpeg85",1,true],["resize50-jpeg85",0.5,true]]) {
    const result = await page.evaluate(async ({ encoded, scale, jpeg }) => {
      const blob=await (await fetch('data:image/png;base64,'+encoded)).blob();
      const bitmap=await createImageBitmap(blob);
      const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
      const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
      if(jpeg){const compressed=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.85));if(compressed.type!=='image/jpeg')throw Error('JPEG encoder unavailable');const b=await createImageBitmap(compressed);x.drawImage(b,0,0);b.close();}
      const start=performance.now();const result=await window.exchange({operation:'decode',pixels:x.getImageData(0,0,c.width,c.height)});
      return { width:c.width,height:c.height,ms:performance.now()-start,status:result.value.status,identifier:result.value.identifier?Array.from(result.value.identifier,x=>x.toString(16).padStart(2,'0')).join(''):null,correctedBits:result.value.correctedBits??null };
    }, { encoded: screenshot.toString("base64"), scale, jpeg });
    report.cases.push({ name, ...result, correct: result.identifier === "0123456789" });
    console.log(name, JSON.stringify(result));
  }
  const negative = await page.evaluate(async () => {
    const result=await window.exchange({operation:'decode',pixels:window.fixture()});
    return { status:result.value.status, identifier:result.value.identifier?Array.from(result.value.identifier,x=>x.toString(16).padStart(2,'0')).join(''):null };
  });
  report.cases.push({ name: "unmarked", ...negative, correct: negative.identifier !== "0123456789" });
  await page.evaluate(() => window.exchange({ operation: "dispose" }));
} catch (error) {
  report.error = error.message;
  console.error(report.error);
} finally {
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
if (report.error || report.cases.some((result) => !result.correct)) process.exitCode = 1;
console.log(`Report: ${path.relative(root, output)}/report.json (not qualification)`);
