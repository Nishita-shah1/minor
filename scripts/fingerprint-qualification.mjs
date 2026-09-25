// Predeclared synthetic tuning matrix. Never freezes or promotes a profile.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pdfFixture } from "./fingerprint/fixtures.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const strength=Number(process.env.FINGERPRINT_STRENGTH??1);
if(![0.8,1,1.25,1.5].includes(strength))throw Error("Unsupported tuning strength");
const output=path.join(root,".fingerprint-results/qualification",`strength-${strength}`);
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(root,"scripts/fingerprint/qualification-browser.mjs")],outfile:path.join(output,"app.js"),bundle:true,format:"esm",platform:"browser",alias:{"@":root}});
await build({entryPoints:[path.join(root,"workers/fingerprint.worker.ts")],outfile:path.join(output,"worker.js"),bundle:true,format:"esm",platform:"browser",alias:{"@":root}});
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,"http://127.0.0.1");
  if(url.pathname==="/"){res.setHeader("Content-Type","text/html");res.end('<!doctype html><meta charset="utf-8"><canvas id="marked"></canvas><script type="module" src="/app.js"></script>');return;}
  let file;
  if(url.pathname==="/app.js")file=path.join(output,"app.js");
  else if(url.pathname==="/workers/fingerprint.worker.ts")file=path.join(output,"worker.js");
  else if(url.pathname.startsWith("/fingerprint-assets/")){file=path.resolve(root,"public",`.${url.pathname}`);if(!file.startsWith(path.join(root,"public/fingerprint-assets")+path.sep))throw Error("Invalid path");}
  else{res.writeHead(404).end();return;}
  res.setHeader("Content-Type",/\.(js|mjs|ts)$/.test(file)?"text/javascript":file.endsWith(".wasm")?"application/wasm":"application/octet-stream");res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browserArgs=process.env.FINGERPRINT_VULKAN==="1"?["--enable-unsafe-webgpu","--enable-features=Vulkan","--use-angle=vulkan","--disable-vulkan-surface"]:["--enable-unsafe-webgpu"];
const positiveCases=[{name:"native"},{name:"resize75",scale:.75},{name:"resize50",scale:.5},{name:"jpeg85",jpeg:true},{name:"resize50-jpeg85",scale:.5,jpeg:true}];
for(const fraction of [.5,.65,.8])for(const position of ["center","top","bottom","left","right"])positiveCases.push({name:`crop-${fraction}-${position}`,fraction,position});
const experimentalCases=[{name:"brightness-plus10",brightness:.1},{name:"brightness-minus10",brightness:-.1},{name:"contrast90",contrast:.9},{name:"contrast110",contrast:1.1},{name:"crop50-resize75",fraction:.5,position:"center",scale:.75}];
const identifier=label=>createHash("sha256").update(label).digest("hex").slice(0,10);
const makeCandidates=(label,correct)=>[1,3,100].map(count=>Array.from({length:count},(_,i)=>({id:`copy-${i}`,identifier:i===0&&correct?correct:i===0?"0000000000":identifier(`${label}-${i}`)})));
const profile=JSON.parse(await readFile(path.join(root,"lib/fingerprint/trustmark/manifest.json"),"utf8"));
const report={kind:"synthetic-tuning-only",qualified:false,profile,strength,browserArgs,candidateCounts:[1,3,100],decoderExecutionsSharedAcrossCandidateCounts:true,alignment:"known-correspondence synthetic points; manual UI accuracy NOT RUN",readability:"NOT RUN",heldOutEvaluation:"NOT RUN",camera:"NOT RUN",corpus:[],positive:[],negative:[],errors:[]};
let browser;
try{
  browser=await chromium.launch({channel:"chrome",headless:process.env.FINGERPRINT_HEADED!=="1",args:browserArgs});
  report.browser=browser.version();const page=await browser.newPage({viewport:{width:1800,height:1800},deviceScaleFactor:1});
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!!window.qual);
  report.runtime=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return{adapter:a?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null,platform:navigator.platform,shaderF16:a?.features.has("shader-f16"),dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]};});
  for(let document=0;document<6;document++){
    const format=document<4?"pdf":"png";
    let rendering;
    if(format==="pdf"){const pdf=pdfFixture(100+document,document);await writeFile(path.join(output,`tuning-${document}.pdf`),pdf);rendering=await page.evaluate(b=>window.qual.pdf(b),pdf.toString("base64"));}
    else rendering=await page.evaluate(i=>window.qual.image(100+i,i===4?"dense":"graphic"),document);
    report.corpus.push({document,format,...rendering});
    await page.evaluate(()=>window.qual.clean());await page.locator("#marked").screenshot({path:path.join(output,`control-${document}.png`)});
    for(let recipient=0;recipient<3;recipient++){
      const expected=identifier(`positive-${document}-${recipient}`),candidates=makeCandidates(`document-${document}`,expected);
      const timing=await page.evaluate(({expected,strength})=>window.qual.encode(expected,strength),{expected,strength});
      const screenshot=await page.locator("#marked").screenshot({path:recipient===0?path.join(output,`marked-${document}.png`):undefined});
      for(const transform of [...positiveCases,...experimentalCases]){
        const result=await page.evaluate(({image,transform,candidates})=>window.qual.scan(image,transform,candidates),{image:screenshot.toString("base64"),transform,candidates});
        report.positive.push({document,format,recipient,case:transform.name,experimental:experimentalCases.includes(transform),...timing,...result,correct:result.resolutions.map(r=>r.status==="CANDIDATE_MATCH"&&r.candidateId==="copy-0"),wrong:result.resolutions.map(r=>r.status==="CANDIDATE_MATCH"&&r.candidateId!=="copy-0")});
      }
      console.log(`Tuning ${format} ${document+1}/6, recipient ${recipient+1}/3 complete`);
      await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2)+"\n");
    }
  }
  const categories=["unmarked","unrelated-foreign","low-information","unsupported-crop","withheld-candidate"];
  for(const category of categories)for(let index=0;index<40;index++){
    await page.evaluate(({seed,category})=>window.qual.image(seed,category==="low-information"?category:"dense"),{seed:1000+categories.indexOf(category)*40+index,category});
    const marked=category==="withheld-candidate"||category==="unrelated-foreign";
    const absent=identifier(`absent-${category}-${index}`);
    if(marked)await page.evaluate(({absent,strength})=>window.qual.encode(absent,strength),{absent,strength});
    else await page.evaluate(()=>window.qual.clean());
    const screenshot=await page.locator("#marked").screenshot();
    const transform=category==="unsupported-crop"?{fraction:.25,position:"center"}:{};
    const candidates=makeCandidates(`negative-${category}-${index}`,null);
    if(candidates.some(set=>set.some(c=>c.identifier===absent)))throw Error("Unexpected candidate collision");
    const result=await page.evaluate(({image,transform,candidates})=>window.qual.scan(image,transform,candidates),{image:screenshot.toString("base64"),transform,candidates});
    report.negative.push({category,index,...result,falseMatches:result.resolutions.map(r=>r.status==="CANDIDATE_MATCH")});
    if(index%10===9){console.log(`Negative ${category}: ${index+1}/40`);await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2)+"\n");}
  }
  await page.evaluate(()=>window.qual.dispose());
}catch(error){report.errors.push(error.message);}
finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const required=report.positive.filter(r=>!r.experimental);
  report.summary={requiredCaptures:required.length,expectedRequiredCaptures:6*3*positiveCases.length,positiveMisses:required.filter(r=>r.correct.some(c=>!c)).length,wrongAttributions:required.filter(r=>r.wrong.some(Boolean)).length,negativeInputs:report.negative.length,distinctNegativeInputs:new Set(report.negative.map(r=>r.hash)).size,negativeFalseMatches:report.negative.filter(r=>r.falseMatches.some(Boolean)).length,processingFailures:[...report.positive,...report.negative].filter(r=>r.reason==="PROCESSING_FAILED").length};
  report.requiredGate=report.errors.length||report.summary.requiredCaptures!==report.summary.expectedRequiredCaptures||report.summary.positiveMisses||report.summary.wrongAttributions||report.summary.negativeInputs!==200||report.summary.distinctNegativeInputs!==200||report.summary.negativeFalseMatches||report.summary.processingFailures?"FAIL":"TUNING_PASS_ONLY";
  await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({gate:report.requiredGate,...report.summary,errors:report.errors},null,2));
  if(report.requiredGate==="FAIL")process.exitCode=1;
}
