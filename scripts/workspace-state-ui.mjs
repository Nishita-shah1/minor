// Isolated browser regression: real workspace components, synthetic auth/API/decoder.
// No connection to Clerk, the database, object storage, or private user documents.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(tmpdir(), "echoleaks-workspaces-"));
const stubs = {
  clerk: `import {useSyncExternalStore} from 'react';
    let signedIn=true;
    const subscribe=fn=>{window.addEventListener('test-session',fn);return()=>window.removeEventListener('test-session',fn)};
    export function changeSession(){signedIn=!signedIn;window.dispatchEvent(new Event('test-session'))}
    export function useAuth(){const yes=useSyncExternalStore(subscribe,()=>signedIn);return {isLoaded:true,userId:yes?'owner':null,sessionId:yes?'session':null}}
    export function useUser(){const auth=useAuth();return {user:auth.userId?{id:'owner'}:null}}
    export function SignOutButton({children}){return children}`,
  navigation: `import {useSyncExternalStore} from 'react';
    const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn)};
    export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname)};`,
  vault: `const state={status:'READY',privateKey:{},bundle:{}};
    export function useKeyVault(){return {state,setup:async()=>{},unlock:async()=>{},refresh:async()=>{}}}`,
  secret: `export const EXPERIMENTAL_PROFILE='fixture';export async function unwrapCopyIdentifier(){return new Uint8Array([1,2,3,4,5])}`,
  engine: `export class BrowserFingerprintEngine {cancel(){} async initialize(){return {provider:'wasm'}} async decode(){await new Promise(r=>setTimeout(r,1000));return {status:'VALID_IDENTIFIER',identifier:new Uint8Array([1,2,3,4,5]),correctedBits:0}}}`,
};
for (const [name, code] of Object.entries(stubs)) await writeFile(path.join(temporary, `${name}.tsx`), code);
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{changeSession}from'@clerk/nextjs';
import{PersistentWorkspaces,workspaceNames}from'${root}/components/dashboard/persistent-workspaces';
import{ScanWorkspace}from'${root}/components/fingerprint/scan-workspace';
import{UploadWorkspace}from'${root}/components/dashboard/upload-workspace';
import{HistoryWorkspace}from'${root}/components/dashboard/history-workspace';
import{SharePanel}from'${root}/components/dashboard/share-panel';
function Profile(){const[value,setValue]=useState('');return <label>Profile draft<input aria-label="Profile draft" value={value} onChange={e=>setValue(e.target.value)}/></label>}
function App(){return <><nav>{workspaceNames.map(name=><button key={name} onClick={()=>{history.pushState({},'',name==='dashboard'?'/dashboard':'/dashboard/'+name);window.dispatchEvent(new PopStateEvent('popstate'))}}>{name}</button>)}<button onClick={changeSession}>Change session</button></nav><PersistentWorkspaces userId="owner" sessionId="session" views={{dashboard:<p>Home</p>,scan:<ScanWorkspace/>,upload:<UploadWorkspace/>,history:<><HistoryWorkspace/><SharePanel groupId="fixture" privateKey={{} as CryptoKey}/></>,profile:<Profile/>}}>{null}</PersistentWorkspaces></>}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
await writeFile(path.join(temporary, "entry.tsx"), entry);
const replacements = [
  [/^@clerk\/nextjs$/, "clerk"], [/^next\/navigation$/, "navigation"],
  [/hooks\/use-key-vault$/, "vault"], [/fingerprint\/copy-secret$/, "secret"], [/fingerprint\/worker-client$/, "engine"],
];
await build({ entryPoints: [path.join(temporary, "entry.tsx")], outfile: path.join(temporary, "app.js"),
  bundle: true, format: "esm", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": root },
  plugins: [{ name: "isolated-fixtures", setup(builder) {
    for (const [filter, name] of replacements) builder.onResolve({ filter }, () => ({ path: path.join(temporary, `${name}.tsx`) }));
  }}],
});
let records = true;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/app.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(path.join(temporary, "app.js"))); return; }
  if (pathname.startsWith("/api/")) {
    if (req.method !== "GET") { res.writeHead(405).end(); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(pathname === "/api/fingerprints" ? {
      candidates: records ? [{ id: "copy", documentId: "doc", shareId: "share", recipientName: "Test Recipient", recipientEmail: "recipient@example.test", ownerWrappedKey: "fixture", profileId: "fixture" }] : [], nextCursor: null,
    } : pathname.endsWith("/shares") ? { shares: [], batchId: null } : { groups: [] })); return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><title>Workspace regression fixture</title><style>[hidden]{display:none!important}body{font:16px sans-serif}nav{position:sticky;top:0;background:white;z-index:100}canvas{max-width:300px}svg{width:20px;height:20px}button{padding:8px;margin:4px}details,section{margin:16px 0}input{padding:8px}</style><div id="root"></div><script type="module" src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const go = name => page.getByRole("button", { name, exact: true }).click();
  await page.goto(`${origin}/dashboard/scan`);
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 1024; const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0,0,768,1024); ctx.fillStyle="black";ctx.fillText("Public navigation fixture",20,40);return canvas.toDataURL().split(",")[1]; });
  await page.getByLabel("Screenshot image", { exact: true }).setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByRole("button", { name: "Analyze screenshot", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Analyze screenshot", exact: true }).click();
  await expect(page.getByTestId("scan-result")).toContainText("Test Recipient");
  await page.getByText("Scan details", { exact: true }).click();
  await go("upload");
  await page.locator('[data-workspace="upload"] input[type="file"]').setInputFiles({ name: "draft.txt", mimeType: "text/plain", buffer: Buffer.from("Public draft fixture") });
  await go("history");
  await page.getByPlaceholder("recipient@example.com").fill("draft@example.test");
  await go("profile");
  await page.getByLabel("Profile draft").fill("Unsaved profile draft");
  await go("dashboard");
  await go("scan");
  await expect(page.locator('canvas[aria-label="Screenshot preview"]')).toBeVisible();
  await expect(page.getByTestId("scan-result")).toContainText("Test Recipient");
  await expect(page.getByTestId("recovered-identifier")).toBeVisible();
  await expect(page.getByTestId("recovered-identifier")).toHaveText("0102030405");
  await go("upload");
  await expect(page.getByText("draft.txt", { exact: true })).toBeVisible();
  await go("history");
  await expect(page.getByPlaceholder("recipient@example.com")).toHaveValue("draft@example.test");
  await go("profile");
  await expect(page.getByLabel("Profile draft")).toHaveValue("Unsaved profile draft");
  await go("scan");
  // Returning during an in-flight scan must not cancel it or strand a busy UI.
  await page.getByRole("button", { name: "Analyze screenshot", exact: true }).click();
  await go("upload"); await go("scan");
  await expect(page.getByTestId("scan-result")).toContainText("Test Recipient");
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
  await go("upload"); await go("scan");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
  await page.getByRole("button", { name: "Clear images", exact: true }).click();
  await go("upload"); await go("scan");
  await expect(page.locator('canvas[aria-label="Screenshot preview"]')).toHaveCount(0);
  await expect(page.getByTestId("scan-result")).toHaveCount(0);
  // New recipient records invalidate a previous association without losing the image.
  await page.getByLabel("Screenshot image", { exact: true }).setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.getByRole("button", { name: "Analyze screenshot", exact: true }).click();
  await expect(page.getByTestId("scan-result")).toContainText("Test Recipient");
  await go("dashboard"); records = false; await go("scan");
  await expect(page.getByTestId("scan-result")).toHaveCount(0);
  await expect(page.locator('canvas[aria-label="Screenshot preview"]')).toBeVisible();
  await go("upload"); await go("Change session");
  await expect(page.locator('[data-workspace]')).toHaveCount(0);
  await go("Change session");
  await expect(page.getByText("draft.txt", { exact: true })).toHaveCount(0);
  await go("scan");
  await expect(page.locator('canvas[aria-label="Screenshot preview"]')).toHaveCount(0);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS: five-route retention, Scan result/preview/details, Upload file queue, sharing/profile drafts, in-flight scan, scroll restoration, clear, refreshed recipients, session cleanup. Synthetic decoder/auth; no attribution qualification.");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
