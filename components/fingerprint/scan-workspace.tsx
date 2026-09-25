"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine, ShieldCheck, Upload, FlaskConical } from "lucide-react";
import { BrowserFingerprintEngine } from "@/lib/fingerprint/worker-client";
import type { Pixels } from "@/lib/fingerprint/types";
import { renderLocalFile, syntheticPage } from "@/lib/fingerprint/lab/render";
import { corners, type Point } from "@/lib/fingerprint/lab/alignment";
import { investigate, type Investigation } from "@/lib/fingerprint/lab/investigate";
import { identifierHex } from "@/lib/fingerprint/identity";
import { CopyLookup, type LocalCandidate } from "./copy-lookup";
import { PixelPreview } from "./pixel-preview";

const button = "inline-flex items-center justify-center gap-2 rounded-full border-2 border-black bg-primary px-5 py-2.5 text-sm font-bold shadow-md transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";
const panel = "space-y-5 rounded-xl border-2 border-black bg-card p-5 shadow-md sm:p-7";
const field = "block w-full rounded-lg border-2 border-black bg-background p-3 text-sm file:mr-3 file:rounded-full file:border-2 file:border-black file:bg-primary file:px-3 file:py-1 file:font-bold";

export function ScanWorkspace() {
  const [selectArea, setSelectArea] = useState(false);
  const [areaPoints, setAreaPoints] = useState<Point[]>([]);
  const [lookupReady, setLookupReady] = useState(false);
  const [candidates, setCandidates] = useState<LocalCandidate[]>([]);
  const engine = useRef<BrowserFingerprintEngine | null>(null);
  const generation = useRef(0);
  const originalFile = useRef<File | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [resizeNotice, setResizeNotice] = useState("");
  const [originalNotice, setOriginalNotice] = useState("");
  const [original, setOriginal] = useState<Pixels | null>(null);
  const [evidence, setEvidence] = useState<Pixels | null>(null);
  const [marked, setMarked] = useState<Pixels | null>(null);
  const [testId, setTestId] = useState("");
  const [aligned, setAligned] = useState(false);
  const [originalPoints, setOriginalPoints] = useState<Point[]>([]);
  const [evidencePoints, setEvidencePoints] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose a PNG or JPEG screenshot to begin.");
  const [result, setResult] = useState<Investigation | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    const epoch = generation;
    const localEngine = new BrowserFingerprintEngine(error => {
      epoch.current++; setBusy(false); setMarked(null); setResult(null); setMessage(error);
    });
    engine.current = localEngine;
    return () => { epoch.current++; localEngine.cancel(); };
  }, []);

  const updateCandidates = useCallback((value: LocalCandidate[], ready: boolean) => {
    generation.current++; engine.current?.cancel(); setBusy(false);
    setCandidates(value); setLookupReady(ready); setResult(null); setDuration(null);
  }, []);

  function clearResult() { setResult(null); setDuration(null); }
  async function run(action: (isCurrent: () => boolean) => Promise<void>) {
    const epoch = ++generation.current;
    setBusy(true); clearResult();
    try { await action(() => epoch === generation.current); }
    catch (error) { if (epoch === generation.current) setMessage(error instanceof Error ? error.message : "Local processing failed. Try a different image."); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  function reset() {
    generation.current++; engine.current?.cancel(); setSelectArea(false); setAreaPoints([]);
    originalFile.current = null; setPage(1); setPageCount(1); setResizeNotice(""); setOriginalNotice("");
    setOriginal(null); setEvidence(null); setMarked(null); setTestId(""); setAligned(false);
    setOriginalPoints([]); setEvidencePoints([]); clearResult(); setBusy(false); setResetKey(k => k + 1);
    setMessage("Cleared local images and stopped the worker.");
  }
  async function load(file: File, target: "original" | "evidence", pageNumber = 1) {
    if (target === "evidence" && !["image/png", "image/jpeg"].includes(file.type)) { setEvidence(null); setEvidencePoints([]); setAligned(false); setMessage("Choose a PNG or JPEG image."); clearResult(); return; }
    setAligned(false); setSelectArea(false); setAreaPoints([]);
    if (target === "evidence") setResizeNotice("");
    if (target === "evidence") { setEvidence(null); setEvidencePoints([]); }
    else { setOriginal(null); setOriginalPoints([]); setMarked(null); setOriginalNotice(""); if (file !== originalFile.current) setTestId(""); }
    await run(async current => {
      setMessage("Reading your file locally…");
      let count = 1, resized = "";
      const pixels = await renderLocalFile(file, { evidence: target === "evidence", page: pageNumber,
        onPageCount: value => { count = value; }, onResize: (from, to) => { resized = `${target === "original" ? "Original fitted" : "Screenshot resized"} locally from ${from} to ${to}. Recovery at this size is not qualified.`; } });
      if (!current()) return;
      if (target === "original") { originalFile.current = file; setPage(pageNumber); setPageCount(count); setOriginal(pixels); setOriginalNotice(resized); } else { setEvidence(pixels); setResizeNotice(resized); }
      setMessage(target === "original" ? `Original page ${pageNumber} of ${count} loaded locally.` : "Screenshot ready. Analyze to check for a compatible fingerprint.");
    });
  }
  async function analyze() {
    if (!evidence || !engine.current || !lookupReady) return;
    await run(async current => {
      setMessage("Checking WebGPU and preparing the local decoder…");
      const runtime = await engine.current!.initialize("decode");
      if (!current()) return;
      setMessage(runtime.provider === "wasm" ? "Analyzing locally on your CPU (WebGPU unavailable). This may take longer…" : "Analyzing pixels locally…");
      const start = performance.now();
      const response = await investigate({ original: original ?? evidence, evidence,
        ...(aligned ? { correspondence: { original: originalPoints, evidence: evidencePoints } } : {}),
        candidates, decode: pixels => engine.current!.decode(pixels) });
      if (!current()) return;
      setResult(response); setDuration(performance.now() - start);
      setMessage(response.status === "CANDIDATE_MATCH" ? "A matching distributed copy was found. This does not identify who intentionally disclosed it." : response.status === "UNKNOWN_MARK" ? (candidates.length ? "Compatible fingerprint recovered, but it does not match the loaded recipient copies." : "Fingerprint recovered, but your account has no fingerprinted recipient copies to match it against.")
        : response.status === "NO_RELIABLE_MARK" ? "No reliable fingerprint was recovered. No recipient has been identified."
        : `Inconclusive — ${response.reason?.replaceAll("_", " ").toLowerCase() ?? "unable to establish a reliable result"}.`);
    });
  }
  async function createTestCopy() {
    if (!original || !engine.current) return;
    setMarked(null);
    await run(async current => {
      setMessage("Creating a low-visibility test fingerprint locally…");
      const identifier = testId ? Uint8Array.from(testId.match(/../g)!, byte => parseInt(byte, 16)) : crypto.getRandomValues(new Uint8Array(5));
      const pixels = await engine.current!.encode(original, identifier, 1);
      if (!current()) return;
      setMarked(pixels); setTestId(identifierHex(identifier));
      setMessage("Test copy ready. Save its PNG or take a screenshot, then add that image above.");
    });
  }
  async function saveTestCopy() {
    if (!marked) return;
    await run(async current => {
      const canvas = document.createElement("canvas"); canvas.width = marked.width; canvas.height = marked.height;
      let url: string | undefined;
      try {
        const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas is unavailable");
        context.putImageData(new ImageData(marked.data, marked.width, marked.height), 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("PNG export failed")), "image/png"));
        if (!current()) return;
        url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "echoleaks-local-test.png"; a.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } finally { if (url) URL.revokeObjectURL(url); canvas.width = canvas.height = 0; }
    });
  }
  function useSelectedArea() {
    if (!evidence || areaPoints.length !== 2) return;
    const left = Math.max(0, Math.floor(Math.min(areaPoints[0].x, areaPoints[1].x)));
    const top = Math.max(0, Math.floor(Math.min(areaPoints[0].y, areaPoints[1].y)));
    const width = Math.min(evidence.width, Math.ceil(Math.max(areaPoints[0].x, areaPoints[1].x))) - left;
    const height = Math.min(evidence.height, Math.ceil(Math.max(areaPoints[0].y, areaPoints[1].y))) - top;
    if (width < 32 || height < 32) {setMessage("Select a larger document area.");return;}
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) data.set(evidence.data.subarray(((top + row) * evidence.width + left) * 4, ((top + row) * evidence.width + left + width) * 4), row * width * 4);
    setEvidence({data,width,height}); setAligned(false); setEvidencePoints([]); setSelectArea(false); setAreaPoints([]); clearResult();
    setMessage("Document area selected locally. Analyze to check its fingerprint.");
  }
  const canAlign = !!original && !!evidence;
  const geometryReady = !aligned || (canAlign && originalPoints.length === 4 && evidencePoints.length === 4);

  return <main className="mx-auto w-full max-w-7xl space-y-7 px-5 py-8 sm:px-8 lg:px-14 lg:py-12">
    <header className="space-y-5">
      <p className="inline-flex rounded-full border-2 border-black bg-card px-4 py-1.5 text-xs font-bold uppercase tracking-widest shadow-sm">EchoLeaks workspace</p>
      <h1 className="font-head text-6xl tracking-tight sm:text-7xl"><span className="bg-linear-to-t from-primary from-25% to-transparent to-25%">Scan</span></h1>
      <p className="max-w-3xl text-lg text-muted-foreground">Check a screenshot for a compatible fingerprint, entirely in your browser.</p>
      <div className="rounded-xl border-2 border-black bg-primary/20 p-4 text-sm"><strong>Experimental local testing.</strong> Local fingerprint check. Recipient lookup requires owner keys and newly fingerprinted shares. Crops and phone photos are unverified.</div>
    </header>
    <CopyLookup onChange={updateCandidates} />
    <div className="grid gap-7 xl:grid-cols-[1.2fr_1fr]">
      <section className={panel}>
        <h2 className="flex items-center gap-3 font-head text-2xl"><Upload aria-hidden="true" /> Add a screenshot</h2>
        <label className="block space-y-2 font-bold">PNG or JPEG image
          <input key={`e-${resetKey}`} aria-label="Screenshot image" className={field} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void load(file, "evidence"); }} />
        </label>
        <p className="text-sm text-muted-foreground">PNG or JPEG, up to 25 MiB. Large screenshots are resized locally. Crop away browser controls so the document fills the image.</p>
        {resizeNotice && <p role="note" className="text-sm text-muted-foreground">{resizeNotice}</p>}
        {evidence && <>
          <PixelPreview pixels={evidence} label="Screenshot preview" points={areaPoints} disabled={busy || areaPoints.length >= 2} onPoint={selectArea ? point => setAreaPoints(points => [...points,point]) : undefined} />
          <button className={`${button} bg-card`} disabled={busy} onClick={() => {setSelectArea(value => !value);setAreaPoints([]);}}>{selectArea ? "Cancel selection" : "Select document area"}</button>
          {selectArea && <><p className="text-sm">Click the top-left and bottom-right corners of the document in your full-screen screenshot.</p><button className={button} disabled={areaPoints.length !== 2 || busy} onClick={useSelectedArea}>Use selected area</button></>}
        </>}
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy || !evidence || !geometryReady || !lookupReady} onClick={() => void analyze()}><ScanLine aria-hidden="true" size={18} />{busy ? "Processing…" : "Analyze screenshot"}</button>
          <button className={`${button} bg-card`} onClick={reset}>Cancel / clear images</button>
        </div>
      </section>
      <section className={panel}>
        <h2 className="flex items-center gap-3 font-head text-2xl"><ShieldCheck aria-hidden="true" /> Result</h2>
        <p role="status" aria-live="polite" className="rounded-lg border-2 border-black bg-background p-4">{message}</p>
        {result && <div className="space-y-3" data-testid="scan-result">
          <p className="font-mono text-sm font-bold">{result.status}</p>
          {result.status === "CANDIDATE_MATCH" && <div className="rounded-xl border-2 border-black bg-primary/20 p-4 space-y-2"><p className="text-xl font-bold">{candidates.find(candidate => candidate.id === result.candidateId)?.recipientName || "Name unavailable"}</p><p className="break-all">{candidates.find(candidate => candidate.id === result.candidateId)?.recipientEmail}</p><p className="text-sm break-all">Share ID: {candidates.find(candidate => candidate.id === result.candidateId)?.shareId}</p></div>}
          {result.identifier && <div><p className="text-sm">Recovered fingerprint ID</p><output data-testid="recovered-identifier" className="break-all font-mono text-2xl font-bold">{result.identifier}</output></div>}
          <p className="text-sm text-muted-foreground">{result.attempts} decode attempt{result.attempts === 1 ? "" : "s"} · {duration?.toFixed(0)} ms{result.coverage !== null ? ` · ${(result.coverage * 100).toFixed(1)}% observed coverage` : ""}</p>
          <p className="text-sm">A recovered ID does not prove who took a screenshot, who disclosed it, or that the image is authentic.</p>
        </div>}
        <p className="border-t-2 border-black pt-4 text-sm text-muted-foreground">Selected images and decoded IDs are processed locally and are not submitted for analysis. Clear the images when you finish.</p>
      </section>
    </div>
    <details className={panel}>
      <summary className="cursor-pointer rounded-lg font-head text-xl">Advanced: original &amp; alignment</summary>
      <p className="text-sm text-muted-foreground">For a crop, choose the clean original and mark the same four points in clockwise order on both images. At least 50% of the original page must be observed. Clean fill does not count as evidence. Cropped recovery is experimental.</p>
      <label className="block space-y-2 font-bold">Local original (PDF, PNG or JPEG)
        <input key={`o-${resetKey}`} aria-label="Original document" className={field} type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void load(file, "original"); }} />
      </label>
      {originalNotice && <p role="note" className="text-sm text-muted-foreground">{originalNotice}</p>}
      {pageCount > 1 && <div className="flex items-center gap-3">
        <button className={button} disabled={busy || page <= 1} onClick={() => originalFile.current && void load(originalFile.current, "original", page - 1)}>Previous page</button>
        <span>Page {page} of {pageCount}</span>
        <button className={button} disabled={busy || page >= pageCount} onClick={() => originalFile.current && void load(originalFile.current, "original", page + 1)}>Next page</button>
      </div>}
      <label className="flex items-center gap-3 rounded-lg border-2 border-black p-3"><input type="checkbox" checked={aligned} disabled={busy || !canAlign} onChange={e => { setAligned(e.target.checked); clearResult(); }} /> Use corresponding points for alignment</label>
      {aligned && original && evidence && <>
        <div className="grid gap-5 md:grid-cols-2">
          <PixelPreview pixels={original} label="Original alignment" points={originalPoints} disabled={busy} onPoint={p => { setOriginalPoints(points => [...points, p]); clearResult(); }} />
          <PixelPreview pixels={evidence} label="Evidence alignment" points={evidencePoints} disabled={busy} onPoint={p => { setEvidencePoints(points => [...points, p]); clearResult(); }} />
        </div>
        <p className="text-sm">Original: {originalPoints.length}/4 points. Screenshot: {evidencePoints.length}/4 points. Start at the same corner and continue clockwise.</p>
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy} onClick={() => { setOriginalPoints([]); setEvidencePoints([]); clearResult(); }}>Reset points</button>
          <button className={`${button} bg-card`} disabled={busy} onClick={() => { setOriginalPoints(corners(original.width, original.height)); setEvidencePoints(corners(evidence.width, evidence.height)); clearResult(); }}>Use full-image corners</button>
        </div>
      </>}
    </details>
    <details className={panel}>
      <summary className="cursor-pointer rounded-lg font-head text-xl"><FlaskConical className="mr-2 inline" aria-hidden="true" /> Create a local test copy</summary>
      <p className="text-sm">Generate a test fingerprint on the original selected above, or use the public sample. This is not a shared recipient copy. Only the completed marked image is displayed here.</p>
      <div className="flex flex-wrap gap-3">
        <button className={`${button} bg-card`} disabled={busy} onClick={() => { originalFile.current = null; setPage(1); setPageCount(1); setOriginal(syntheticPage()); setOriginalPoints([]); setAligned(false); setMarked(null); setTestId(""); clearResult(); setMessage("Public sample loaded as the original."); }}>Use public sample</button>
        <button className={button} disabled={busy || !original} onClick={() => void createTestCopy()}>Create marked test copy</button>
      </div>
      {marked && <>
        <p>Test fingerprint ID: <output data-testid="test-identifier" className="font-mono font-bold">{testId}</output></p>
        <PixelPreview pixels={marked} label="Marked test copy" />
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy} onClick={() => void saveTestCopy()}>Save test PNG</button>
          <button className={`${button} bg-card`} disabled={busy} onClick={() => { setEvidence(marked); setEvidencePoints([]); setAligned(false); clearResult(); setMessage("Exact marked pixels selected. Analyze to test the in-memory round trip."); }}>Use marked image for scan</button>
        </div>
      </>}
    </details>
  </main>;
}
