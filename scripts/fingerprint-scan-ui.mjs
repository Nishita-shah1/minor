// Real React component + real WebGPU worker. No auth bypass or database writes.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "test-results/fingerprint-scan-ui");
await mkdir(output, { recursive: true });
await writeFile(path.join(output,"entry.tsx"), `import React from 'react';import{createRoot}from'react-dom/client';import{ScanWorkspace}from'../../components/fingerprint/scan-workspace';createRoot(document.getElementById('root')!).render(<ScanWorkspace/>);`);
await build({entryPoints:[path.join(output,"entry.tsx")],outfile:path.join(output,"app.js"),bundle:true,format:"esm",platform:"browser",jsx:"automatic",alias:{"@":root}});
await build({entryPoints:[path.join(root,"workers/fingerprint.worker.ts")],outfile:path.join(output,"worker.js"),bundle:true,format:"esm",platform:"browser",alias:{"@":root}});
const server=createServer(async(request,response)=>{
  try {
    const url=new URL(request.url,"http://127.0.0.1");
    if(url.pathname==="/"){response.setHeader("Content-Type","text/html");response.end('<!doctype html><meta charset="utf-8"><title>Scan UI local verification</title><style>body{font:16px sans-serif;background:#fff8e8;padding:24px}canvas{max-width:720px;height:auto}button,input,section,details{border-radius:12px}button{padding:12px;margin:6px}section,details{border:2px solid black;padding:20px;margin:24px 0}output{font-weight:bold}figure{max-width:720px}</style><div id="root"></div><script type="module" src="/app.js"></script>');return;}
    let file;
    if(url.pathname==="/app.js")file=path.join(output,"app.js");
    else if(url.pathname==="/workers/fingerprint.worker.ts")file=path.join(output,"worker.js");
    else if(url.pathname.startsWith("/fingerprint-assets/")){
      file=path.resolve(root,"public",`.${url.pathname}`);
      if(!file.startsWith(path.join(root,"public/fingerprint-assets")+path.sep))throw Error("Path outside assets");
    }else if(url.pathname==="/pdfjs-dist/build/pdf.worker.min.mjs")file=path.join(root,"node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
    else {response.writeHead(404).end();return;}
    response.setHeader("Content-Type",/\.(js|mjs|ts)$/.test(file)?"text/javascript":file.endsWith(".wasm")?"application/wasm":"application/octet-stream");response.end(await readFile(file));
  }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const args=process.env.FINGERPRINT_VULKAN==="1"?["--enable-unsafe-webgpu","--enable-features=Vulkan","--use-angle=vulkan","--disable-vulkan-surface"]:["--enable-unsafe-webgpu"];
const report={kind:"component-ui-smoke-only",qualified:false,checks:[],errors:[],browserArgs:args};
let browser;
try {
  browser=await chromium.launch({channel:"chrome",headless:process.env.FINGERPRINT_HEADED!=="1",args});
  report.browser=browser.version();
  const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});
  page.setDefaultTimeout(180000);
  const origin=`http://127.0.0.1:${server.address().port}`;
  const requests=[];
  page.on("request",r=>requests.push({url:r.url(),method:r.method()}));
  page.on("pageerror",error=>report.errors.push(error.message));
  await page.goto(origin);
  await expect(page.getByRole("heading",{name:"Scan",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Analyze screenshot",exact:true})).toBeDisabled();
  await page.getByText("Create a local test copy",{exact:true}).click();
  await page.getByRole("button",{name:"Use public sample",exact:true}).click();
  await page.getByRole("button",{name:"Create marked test copy",exact:true}).click();
  await expect(page.getByTestId("test-identifier")).toHaveText(/^[0-9a-f]{10}$/);
  const expected=await page.getByTestId("test-identifier").textContent();
  report.checks.push({name:"local-encode",pass:true});
  await page.getByRole("button",{name:"Use marked image for scan",exact:true}).click();
  await page.getByRole("button",{name:"Analyze screenshot",exact:true}).click();
  await expect(page.getByTestId("recovered-identifier")).toHaveText(expected);
  report.checks.push({name:"exact-pixel-ui-decode",pass:true});
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Save test PNG",exact:true}).click();
  const download=await downloadPromise;
  const png=path.join(output,"marked.png");await download.saveAs(png);
  await expect(page.getByLabel("Screenshot image",{exact:true})).toBeEnabled();
  await page.getByLabel("Screenshot image",{exact:true}).setInputFiles(png);
  await page.getByRole("button",{name:"Analyze screenshot",exact:true}).click();
  await expect(page.getByTestId("recovered-identifier")).toHaveText(expected);
  report.checks.push({name:"png-download-upload-decode",pass:true});
  const screenshot=path.join(output,"screenshot.png");
  await page.locator('canvas[aria-label="Marked test copy"]').screenshot({path:screenshot});
  await page.getByLabel("Screenshot image",{exact:true}).setInputFiles(screenshot);
  await page.getByRole("button",{name:"Analyze screenshot",exact:true}).click();
  await expect(page.getByTestId("recovered-identifier")).toHaveText(expected);
  report.checks.push({name:"visible-canvas-screenshot-upload-decode",pass:true});
  await page.getByLabel("Use corresponding points for alignment").check();
  await page.getByRole("button",{name:"Use full-image corners",exact:true}).click();
  await page.getByRole("button",{name:"Analyze screenshot",exact:true}).click();
  await expect(page.getByTestId("recovered-identifier")).toHaveText(expected);
  await expect(page.getByTestId("scan-result")).toContainText("2 decode attempts");
  report.checks.push({name:"aligned-two-attempt-ui-decode",pass:true});
  await page.getByRole("button",{name:"Cancel / clear images",exact:true}).click();
  await expect(page.getByTestId("recovered-identifier")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Analyze screenshot",exact:true})).toBeDisabled();
  report.checks.push({name:"clear-and-release-ui",pass:true});
  const unmarked=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=768;c.height=1024;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='24px sans-serif';for(let i=0;i<24;i++)x.fillText('Unmarked public fixture '+i,30,60+i*30);return c.toDataURL().split(',')[1];});
  const control=path.join(output,"unmarked.png");await writeFile(control,Buffer.from(unmarked,"base64"));
  await page.getByLabel("Screenshot image",{exact:true}).setInputFiles(control);
  await page.getByRole("button",{name:"Analyze screenshot",exact:true}).click();
  await expect(page.getByTestId("scan-result")).toContainText("NO_RELIABLE_MARK");
  report.checks.push({name:"unmarked-ui-abstention",pass:true});
  if(requests.some(r=>!r.url.startsWith(origin+"/")||r.method!=="GET"))throw Error("Unexpected network request in local UI harness");
  report.checks.push({name:"local-assets-only-no-image-posts",pass:true,requests:requests.length});
  if(report.errors.length)throw Error("Browser errors recorded");
  await page.screenshot({path:path.join(output,"ui.png"),fullPage:true});
}catch(error){report.errors.push(error.message);process.exitCode=1;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2)+"\n");}
console.log(JSON.stringify(report,null,2));
