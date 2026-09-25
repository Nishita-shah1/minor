import { BrowserFingerprintEngine } from "../../lib/fingerprint/worker-client";
import { renderLocalFile } from "../../lib/fingerprint/lab/render";
import { investigate } from "../../lib/fingerprint/lab/investigate";
import { corners } from "../../lib/fingerprint/lab/alignment";
import { resolveIdentifier } from "../../lib/fingerprint/identity";

const engine = new BrowserFingerprintEngine();
let original;
function canvas(width,height){const c=document.createElement("canvas");c.width=width;c.height=height;return c;}
function paint(pixels){const c=document.querySelector("#marked");c.width=pixels.width;c.height=pixels.height;c.getContext("2d").putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);}
const bytes=hex=>Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
function region(width,height,fraction,position){
  let w=width,h=height,x=0,y=0;
  if(position==="left"||position==="right") {w=Math.ceil(width*fraction);x=position==="right"?width-w:0;}
  else {h=Math.ceil(height*fraction);y=position==="bottom"?height-h:position==="center"?Math.floor((height-h)/2):0;}
  return {x,y,w,h};
}
window.qual={
  async pdf(encoded){const start=performance.now();original=await renderLocalFile(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],"fixture.pdf",{type:"application/pdf"}));return {width:original.width,height:original.height,renderMs:performance.now()-start};},
  async image(seed,category="dense"){
    const c=canvas(768,1024),x=c.getContext("2d");x.fillStyle="white";x.fillRect(0,0,768,1024);
    if(category==="low-information") {x.fillStyle=`rgb(${190+seed%65},${190+(seed*7)%65},${190+(seed*13)%65})`;x.fillRect(0,0,768,1024);x.fillStyle="black";x.fillRect(seed%700,seed%950,2,2);}
    else if(category==="graphic"){
      for(let y=0;y<1024;y+=16)for(let z=0;z<768;z+=16){x.fillStyle=`rgb(${(z+seed)%256},${(y+seed*3)%256},${(z^y^seed)%256})`;x.fillRect(z,y,16,16);}
    }else{
      x.fillStyle="#111";x.font="bold 30px sans-serif";x.fillText(`PUBLIC DOCUMENT ${seed}`,35,65);x.font="18px sans-serif";
      for(let i=0;i<30;i++)x.fillText(`Item ${i+1}: ${(seed*31+i*17.39).toFixed(2)} — Evidence stays local.`,35,105+i*28);
    }
    const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
    original=await renderLocalFile(new File([blob],"fixture.png",{type:"image/png"}));c.width=c.height=0;
    return {width:original.width,height:original.height};
  },
  clean(){paint(original);},
  async encode(identifier,strength){const start=performance.now();const marked=await engine.encode(original,bytes(identifier),strength);paint(marked);return {encodeMs:performance.now()-start};},
  async scan(encoded,transform,candidateSets){
    const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+encoded)).blob());
    const crop=transform.fraction?region(bitmap.width,bitmap.height,transform.fraction,transform.position):{x:0,y:0,w:bitmap.width,h:bitmap.height};
    const scale=transform.scale??1,c=canvas(Math.round(crop.w*scale),Math.round(crop.h*scale)),x=c.getContext("2d");
    x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";x.drawImage(bitmap,crop.x,crop.y,crop.w,crop.h,0,0,c.width,c.height);bitmap.close();
    if(transform.brightness||transform.contrast){const p=x.getImageData(0,0,c.width,c.height);for(let i=0;i<p.data.length;i+=4)for(let k=0;k<3;k++)p.data[i+k]=Math.round((p.data[i+k]-127.5)*(transform.contrast??1)+127.5+(transform.brightness??0)*255);x.putImageData(p,0,0);}
    if(transform.jpeg){const blob=await new Promise(resolve=>c.toBlob(resolve,"image/jpeg",0.85));if(blob.type!=="image/jpeg")throw Error("JPEG encoding unavailable");const b=await createImageBitmap(blob);x.drawImage(b,0,0);b.close();}
    const evidence=x.getImageData(0,0,c.width,c.height);
    const originalRegion=transform.fraction?region(original.width,original.height,transform.fraction,transform.position):{x:0,y:0,w:original.width,h:original.height};
    const correspondence={original:corners(originalRegion.w,originalRegion.h).map(p=>({x:p.x+originalRegion.x,y:p.y+originalRegion.y})),evidence:corners(c.width,c.height)};
    const start=performance.now();
    const result=await investigate({original,evidence,correspondence,candidates:[],decode:pixels=>engine.decode(pixels)});
    const resolutionStart=performance.now();
    const resolutions=candidateSets.map(candidates=>result.identifier?resolveIdentifier(bytes(result.identifier),candidates.map(c=>({id:c.id,identifier:bytes(c.identifier)}))):{status:result.status});
    const resolutionMs=performance.now()-resolutionStart;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",evidence.data)),x=>x.toString(16).padStart(2,'0')).join('');
    const value={...result,resolutions,width:c.width,height:c.height,hash,decodeAndAlignmentMs:resolutionStart-start,resolutionMs,heapBytes:performance.memory?.usedJSHeapSize??null};
    c.width=c.height=0;return value;
  },
  async dispose(){original=null;await engine.dispose();const c=document.querySelector("#marked");c.width=c.height=0;}
};
