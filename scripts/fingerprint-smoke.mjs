// Local developer smoke test, not the held-out qualification or a human review.
import { createHash } from "node:crypto";
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
if (process.env.FINGERPRINT_LARGE_IMAGE === "1") {
  await build({ entryPoints: [path.join(root, "lib/fingerprint/lab/render.ts")], outfile: path.join(output, "render.js"),
    bundle: true, format: "esm", platform: "browser", target: "es2022", alias: { "@": root } });
}
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
    else if (url.pathname === "/render.js" && process.env.FINGERPRINT_LARGE_IMAGE === "1") file = path.join(output, "render.js");
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
const manifest = JSON.parse(await readFile(path.join(root,"lib/fingerprint/trustmark/manifest.json"),"utf8"));
const report = { profile:manifest, strength, browserArgs, kind: "tuning-smoke-only", qualified: false, runtime: null, cases: [], error: null };
try {
  browser = await chromium.launch({ channel: "chrome", headless: process.env.FINGERPRINT_HEADED !== "1", args: browserArgs });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  report.runtime = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return { browser: navigator.userAgent, adapter: adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null,
      shaderF16: adapter?.features.has("shader-f16") ?? false };
  });
  report.runtime.build = browser.version();
  report.runtime.display = await page.evaluate(()=>({dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]}));
  console.log("Runtime:", JSON.stringify(report.runtime));
  const clean = await page.evaluate(() => { const p=window.fixture();const c=document.createElement("canvas");c.width=p.width;c.height=p.height;c.getContext("2d").putImageData(p,0,0);return c.toDataURL("image/png").split(",")[1]; });
  await writeFile(path.join(output,"unmarked-fixture.png"),Buffer.from(clean,"base64"));
  if(process.env.FINGERPRINT_REFERENCE_PNG) {
    const encoded=(await readFile(process.env.FINGERPRINT_REFERENCE_PNG)).toString("base64");
    const result=await page.evaluate(async (encoded)=>{
      const b=await createImageBitmap(await (await fetch('data:image/png;base64,'+encoded)).blob());
      const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);b.close();
      const r=(await window.exchange({operation:'decode',pixels:x.getImageData(0,0,c.width,c.height)})).value;
      return {status:r.status,identifier:r.identifier?Array.from(r.identifier,x=>x.toString(16).padStart(2,'0')).join(''):null};
    },encoded);
    report.cases.push({name:"upstream-png",...result,correct:result.identifier==="0123456789"});
    console.log("upstream-png",JSON.stringify(result));
    if(!report.cases.at(-1).correct) throw new Error("Upstream PNG decode failed");
  }
  report.encodeMs = [];
  for(let repeat=0;repeat<3;repeat++) {
    const encodeStart=performance.now();
    await page.evaluate(async (strength) => {
      const source=window.fixture();
      const result=await window.exchange({operation:'encode',pixels:source,identifier:new Uint8Array([1,35,69,103,137]),strength});
      window.exactMarked=result.value;
      const c=document.querySelector('#marked');c.width=result.value.width;c.height=result.value.height;
      c.getContext('2d').putImageData(new ImageData(result.value.data,c.width,c.height),0,0);
    }, strength);
    report.encodeMs.push(performance.now()-encodeStart);
    const direct = await page.evaluate(async () => {
      const r=(await window.exchange({operation:'decode',pixels:window.exactMarked})).value;
      return {status:r.status,identifier:r.identifier?Array.from(r.identifier,x=>x.toString(16).padStart(2,'0')).join(''):null};
    });
    report.cases.push({name:`exact-memory-${repeat+1}`,...direct,correct:direct.identifier==="0123456789"});
    console.log("exact-memory",JSON.stringify(direct));
    if (!report.cases.at(-1).correct) throw new Error("Exact-memory gate failed; PNG and screenshot stages NOT RUN");
  }
  const markedData = await page.evaluate(() => document.querySelector("#marked").toDataURL("image/png").split(",")[1]);
  await writeFile(path.join(output,"marked-pixels.png"),Buffer.from(markedData,"base64"));
  report.pngSha256=createHash("sha256").update(Buffer.from(markedData,"base64")).digest("hex");
  let screenshot;
  for (const [name, scale, jpeg] of [["png-export",1,false],["native",1,false],["resize75",0.75,false],["resize50",0.5,false],["jpeg85",1,true],["resize50-jpeg85",0.5,true]]) {
    if(name === "native") screenshot = await page.locator("#marked").screenshot({path:path.join(output,"marked-screenshot.png")});
    const result = await page.evaluate(async ({ encoded, scale, jpeg }) => {
      const blob=await (await fetch('data:image/png;base64,'+encoded)).blob();
      const bitmap=await createImageBitmap(blob);
      const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
      const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
      if(jpeg){const compressed=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.85));if(compressed.type!=='image/jpeg')throw Error('JPEG encoder unavailable');const b=await createImageBitmap(compressed);x.drawImage(b,0,0);b.close();}
      const start=performance.now();const result=await window.exchange({operation:'decode',pixels:x.getImageData(0,0,c.width,c.height)});
      return { width:c.width,height:c.height,ms:performance.now()-start,status:result.value.status,identifier:result.value.identifier?Array.from(result.value.identifier,x=>x.toString(16).padStart(2,'0')).join(''):null,correctedBits:result.value.correctedBits??null };
    }, { encoded: name === "png-export" ? markedData : screenshot.toString("base64"), scale, jpeg });
    report.cases.push({ name, ...result, correct: result.identifier === "0123456789" });
    console.log(name, JSON.stringify(result));
    if(name === "png-export" && result.identifier !== "0123456789") throw new Error("PNG gate failed; screenshot stages NOT RUN");
  }
  report.screenshotSha256=createHash("sha256").update(screenshot).digest("hex");
  const negative = await page.evaluate(async () => {
    const result=await window.exchange({operation:'decode',pixels:window.fixture()});
    return { status:result.value.status, identifier:result.value.identifier?Array.from(result.value.identifier,x=>x.toString(16).padStart(2,'0')).join(''):null };
  });
  report.cases.push({ name: "unmarked", ...negative, correct: negative.status === "NO_RELIABLE_MARK" && negative.identifier === null });
  if (process.env.FINGERPRINT_LARGE_IMAGE === "1") {
    for (const [width, height] of [[6000, 4000], [12000, 2000]]) {
      const result = await page.evaluate(async ({ width, height, strength }) => {
        const { renderLocalFile } = await import("/render.js");
        const source = document.createElement("canvas");
        source.width = width; source.height = height;
        const context = source.getContext("2d");
        context.fillStyle = "white"; context.fillRect(0, 0, width, height);
        context.fillStyle = "#222"; context.font = `${Math.max(60, height / 25)}px sans-serif`;
        context.fillText("PUBLIC LARGE IMAGE FIXTURE", width / 12, height / 3);
        context.fillStyle = "#b7d8da"; context.fillRect(width / 12, height * 0.7, width * 0.8, height * 0.05);
        const blob = await new Promise(resolve => source.toBlob(resolve, "image/png"));
        source.width = source.height = 0;
        const notices = [];
        const pixels = await renderLocalFile(new File([blob], "large.png", { type: "image/png" }), {
          onResize: (from, to) => notices.push({ from, to }),
        });
        const marked = (await window.exchange({ operation: "encode", pixels,
          identifier: new Uint8Array([1, 35, 69, 103, 137]), strength })).value;
        const exact = (await window.exchange({ operation: "decode", pixels: marked })).value;
        const canvas = document.querySelector("#marked");
        canvas.width = marked.width; canvas.height = marked.height;
        canvas.getContext("2d").putImageData(new ImageData(marked.data, marked.width, marked.height), 0, 0);
        const exported = await createImageBitmap(await (await fetch(canvas.toDataURL("image/png"))).blob());
        const copy = document.createElement("canvas");
        copy.width = exported.width; copy.height = exported.height;
        copy.getContext("2d").drawImage(exported, 0, 0); exported.close();
        const png = (await window.exchange({ operation: "decode", pixels: copy.getContext("2d").getImageData(0, 0, copy.width, copy.height) })).value;
        copy.width = copy.height = 0;
        const id = value => value.identifier ? Array.from(value.identifier, x => x.toString(16).padStart(2, "0")).join("") : null;
        return { source: [width, height], marked: [marked.width, marked.height], notices,
          exact: id(exact), png: id(png) };
      }, { width, height, strength });
      const screenshotBytes = await page.locator("#marked").screenshot();
      const screenshotId = await page.evaluate(async encoded => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
        const decoded = (await window.exchange({ operation: "decode", pixels: context.getImageData(0, 0, canvas.width, canvas.height) })).value;
        canvas.width = canvas.height = 0;
        return decoded.identifier ? Array.from(decoded.identifier, value => value.toString(16).padStart(2, "0")).join("") : null;
      }, screenshotBytes.toString("base64"));
      await page.evaluate(() => { const canvas = document.querySelector("#marked"); canvas.width = canvas.height = 0; });
      report.cases.push({ name: `large-${width}x${height}`, ...result, screenshot: screenshotId,
        correct: result.exact === "0123456789" && result.png === "0123456789" && screenshotId === "0123456789" && result.notices.length === 1 });
      console.log("large-image", JSON.stringify({ ...result, screenshot: screenshotId }));
    }
  }
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
