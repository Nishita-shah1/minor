// Actual SharePanel/Dialog, with synthetic owner API and wrapping service.
// No Clerk, Neon, R2 or Brevo calls. This is not an authenticated live demo.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(), output = path.join(root, ".fingerprint-results/share-ui");
await mkdir(output, { recursive: true });
await writeFile(path.join(output,"entry.tsx"), `import React from 'react';import{createRoot}from'react-dom/client';import{SharePanel}from'../../components/dashboard/share-panel';createRoot(document.getElementById('root')!).render(<SharePanel groupId="11111111-1111-4111-8111-111111111111" privateKey={{} as CryptoKey}/>);`);
await writeFile(path.join(output,"wrapping.ts"), `export async function rewrapForRecipients({recipients,documents}){return recipients.filter(r=>r.status==='READY').map(r=>({...r,envelopes:documents.map(d=>({documentId:d.documentId,wrappedFileKey:'test-envelope'}))}));}`);
await build({entryPoints:[path.join(output,"entry.tsx")],outfile:path.join(output,"app.js"),bundle:true,format:"esm",platform:"browser",jsx:"automatic",alias:{"@/lib/crypto/worker-client":path.join(output,"wrapping.ts"),"@":root}});
const state = { batchId:null, shares:[], permission:"VIEW_ONLY", availableFrom:null, expiresAt:null };
const emails=[];
const report={checks:[],errors:[],scope:"Component with mocked services; no real email"};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/"){res.setHeader("Content-Type","text/html");res.end('<!doctype html><meta charset="utf-8"><style>body{font:16px sans-serif}button,input{padding:8px;margin:4px} [data-slot="dialog-content"]{position:fixed;inset:10%;background:white;border:3px solid black;border-radius:16px;padding:24px;overflow:auto;z-index:100} [data-slot="dialog-overlay"]{position:fixed;inset:0;background:#aaa8;z-index:50}</style><div id="root"></div><script type="module" src="/app.js"></script>');return;}
  if(url.pathname==="/app.js"){res.setHeader("Content-Type","text/javascript");res.end(await readFile(path.join(output,"app.js")));return;}
  let raw="";for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  res.setHeader("Content-Type","application/json");
  if(url.pathname.endsWith("/owner-access"))return res.end(JSON.stringify({files:[{documentId:"33333333-3333-4333-8333-333333333333",status:"READY",wrappedFileKey:"test"}]}));
  if(url.pathname.endsWith("/prepare"))return res.end(JSON.stringify({recipients:body.recipientEmails.map(email=>({email,status:"READY",clerkUserId:email,keyVersion:1,publicKeyFingerprint:"a".repeat(64),publicKeyJwk:{}}))}));
  if(url.pathname.endsWith("/shares")){
   if(req.method==="POST"){
    state.batchId="22222222-2222-4222-8222-222222222222";
    for(const r of body.recipients)if(!state.shares.some(s=>s.recipientEmail===r.email)){const id=crypto.randomUUID();state.shares.push({shareId:id,recipientEmail:r.email,status:"ACTIVE",shareUrl:`http://example.test/share/${id}`});}
   }
   return res.end(JSON.stringify(state));
  }
  if(url.pathname.endsWith("/email")){emails.push(body);return res.end('{"status":"ACCEPTED"}');}
  res.writeHead(404).end();
 }catch(error){report.errors.push(error.message);res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try {
 browser=await chromium.launch({channel:"chrome",headless:true});
 const context=await browser.newContext({permissions:["clipboard-read","clipboard-write"]});
 const page=await context.newPage(); page.on("pageerror",error=>report.errors.push(error.message));
 const origin=`http://127.0.0.1:${server.address().port}`;
 page.on("request",req=>{if(!req.url().startsWith(origin))report.errors.push(`Unexpected external request: ${req.url()}`);});
 await page.goto(origin);
 async function add(email,button){await page.getByPlaceholder("recipient@example.com").fill(email);await page.getByRole("button",{name:"Add",exact:true}).click();await page.getByRole("button",{name:"Prepare share",exact:true}).click();await page.getByRole("button",{name:button,exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();}
 await add("alice@example.test","Create secure links");
 const alice=state.shares[0].shareUrl;
 await page.getByRole("button",{name:"Copy link",exact:true}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(alice);
 report.checks.push("create opens popup; copy returns persisted link");
 await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"View secure links",exact:true}).click();
 await expect(page.getByLabel("Secure link for alice@example.test")).toHaveValue(alice);
 report.checks.push("dismissed popup reopens same link");
 await page.reload();
 await page.getByRole("button",{name:"View secure links",exact:true}).click();
 await expect(page.getByLabel("Secure link for alice@example.test")).toHaveValue(alice);
 report.checks.push("reload loads persisted links");
 await page.keyboard.press("Escape");
 await add("bob@example.test","Add recipients and show links");
 expect(state.shares.length).toBe(2);
 await expect(page.getByLabel("Secure link for alice@example.test")).toHaveValue(alice);
 await expect(page.getByLabel("Secure link for bob@example.test")).toBeVisible();
 report.checks.push("append keeps Alice link and adds Bob in same batch");
 await page.getByRole("button",{name:"Send / resend links via Brevo",exact:true}).click();
 await expect(page.getByRole("dialog")).toContainText("Brevo accepted");
 await page.getByRole("button",{name:"Send / resend links via Brevo",exact:true}).click();
 await expect.poll(()=>emails.length).toBe(2);
 expect(emails[0].attemptId).not.toBe(emails[1].attemptId);
 report.checks.push("explicit resend uses new attempt; dialog remains available");
 if(report.errors.length)throw Error(report.errors.join("\n"));
 await page.screenshot({path:path.join(output,"popup.png"),fullPage:true});
}catch(error){report.errors.push(error.message);process.exitCode=1;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
