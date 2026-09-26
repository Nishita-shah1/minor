"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine, ShieldCheck, Upload, FlaskConical } from "lucide-react";
import { DenseCropEngine } from "@/lib/fingerprint/dense/worker-client";
import { BrowserFingerprintEngine } from "@/lib/fingerprint/worker-client";
import type { Pixels } from "@/lib/fingerprint/types";
import { renderLocalFile, syntheticPage } from "@/lib/fingerprint/lab/render";
import { corners, type Point } from "@/lib/fingerprint/lab/alignment";
import { investigate, type Investigation } from "@/lib/fingerprint/lab/investigate";
import { embedDense } from "@/lib/fingerprint/dense/embed";
import { identifierHex } from "@/lib/fingerprint/identity";
import { CopyLookup, type LocalCandidate } from "./copy-lookup";
import { FingerprintMatchScore } from "./fingerprint-match-score";
import { RankedEvidence } from "./ranked-evidence";
import { PixelPreview } from "./pixel-preview";

const button = "inline-flex items-center justify-center gap-2 rounded-full border-2 border-black bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold shadow-md transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton = button.replace("bg-primary text-primary-foreground", "bg-card text-card-foreground");
const panel = "space-y-5 rounded-xl border-2 border-black bg-card p-5 shadow-md sm:p-7";
const field = "block w-full rounded-lg border-2 border-black bg-background p-3 text-sm file:mr-3 file:rounded-full file:border-2 file:border-black file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold";

export function ScanWorkspace() {
  const [selectArea, setSelectArea] = useState(false);
  const [areaPoints, setAreaPoints] = useState<Point[]>([]);
  const [lookupReady, setLookupReady] = useState(false);
  const [candidates, setCandidates] = useState<LocalCandidate[]>([]);
  const engine = useRef<BrowserFingerprintEngine | null>(null);
  const dense = useRef<DenseCropEngine | null>(null);
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
    const denseEngine = new DenseCropEngine(error => {
      epoch.current++; setBusy(false); setMarked(null); setResult(null); setMessage(error);
    });
    engine.current = localEngine;
    dense.current = denseEngine;
    return () => { epoch.current++; localEngine.cancel(); denseEngine.cancel(); };
  }, []);

  const candidateSnapshot = useRef<string | null>(null);
  const updateCandidates = useCallback((value: LocalCandidate[], ready: boolean) => {
    setLookupReady(ready);
    if (!ready) return;
    const snapshot = JSON.stringify(value.map(candidate => [candidate.id, identifierHex(candidate.identifier), candidate.recipientName, candidate.recipientEmail, candidate.shareId]).sort());
    if (candidateSnapshot.current !== null && snapshot !== candidateSnapshot.current) {
      setResult(null); setDuration(null);
      setMessage("Recipient records changed. Analyze the screenshot again to refresh the result.");
    }
    candidateSnapshot.current = snapshot;
    setCandidates(value);
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
    generation.current++; engine.current?.cancel(); dense.current?.cancel(); setSelectArea(false); setAreaPoints([]);
    originalFile.current = null; setPage(1); setPageCount(1); setResizeNotice(""); setOriginalNotice("");
    setOriginal(null); setEvidence(null); setMarked(null); setTestId(""); setAligned(false);
    setOriginalPoints([]); setEvidencePoints([]); clearResult(); setBusy(false); setResetKey(k => k + 1);
    setMessage("Images cleared. Choose another screenshot to begin.");
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
        onPageCount: value => { count = value; }, onResize: (from, to) => { resized = `${target === "original" ? "Original fitted" : "Screenshot resized"} locally from ${from} to ${to}. Resizing may affect fingerprint recovery.`; } });
      if (!current()) return;
      if (target === "original") { originalFile.current = file; setPage(pageNumber); setPageCount(count); setOriginal(pixels); setOriginalNotice(resized); } else { setEvidence(pixels); setResizeNotice(resized); }
      setMessage(target === "original" ? `Original page ${pageNumber} of ${count} loaded locally.` : "Screenshot ready. Select Analyze screenshot to find a match.");
    });
  }
  async function analyze() {
    if (!evidence || !engine.current || !lookupReady) return;
    const snapshot = candidateSnapshot.current;
    // Background lookup refreshes may zero old records; this scan owns its snapshot.
    const scanCandidates = candidates.map(candidate => ({ ...candidate, identifier: candidate.identifier.slice(), secret: candidate.secret?.slice() ?? null }));
    try { await run(async current => {
      setMessage("Preparing your scan…");
      const runtime = await engine.current!.initialize("decode");
      if (!current()) return;
      setMessage(runtime.provider === "wasm" ? "Analyzing your screenshot… This may take a moment." : "Analyzing your screenshot…");
      const start = performance.now();
      const denseCandidates = scanCandidates.flatMap(candidate => candidate.secret ? [{ id: candidate.id, secret: candidate.secret, documentId: candidate.documentId }] : []);
      const response = await investigate({ original: original ?? evidence, evidence,
        ...(aligned ? { correspondence: { original: originalPoints, evidence: evidencePoints } } : {}),
        candidates: scanCandidates, decode: pixels => engine.current!.decode(pixels),
        rankDense: denseCandidates.length ? async pixels => (await dense.current!.rank(pixels, original ? [page] : [1], denseCandidates)).value : undefined });
      if (!current()) return;
      if (snapshot !== candidateSnapshot.current) {
        setMessage("Recipient records changed. Analyze the screenshot again to refresh the result.");
        return;
      }
      setResult(response); setDuration(performance.now() - start);
      setMessage(response.status === "CANDIDATE_MATCH" ? "Matching copy found." : response.status === "PROBABLE_MATCH" ? "A cropped screenshot is consistent with one distributed copy. This is a relative score, not a probability."
        : response.status === "UNKNOWN_MARK" ? (candidates.length ? "Compatible fingerprint recovered, but it does not match the loaded recipient copies." : "Fingerprint recovered, but your account has no fingerprinted recipient copies to match it against.")
        : response.status === "NO_RELIABLE_MARK" ? "No reliable fingerprint was recovered. No recipient has been identified."
        : response.scores?.length ? "Inconclusive. The crop does not clear the margin, so no copy is named."
        : `Inconclusive — ${response.reason?.replaceAll("_", " ").toLowerCase() ?? "unable to establish a reliable result"}.`);
    }); } finally { scanCandidates.forEach(candidate => { candidate.identifier.fill(0); candidate.secret?.fill(0); }); }
  }
  async function createTestCopy() {
    if (!original || !engine.current) return;
    setMarked(null);
    await run(async current => {
      setMessage("Creating a low-visibility test fingerprint locally…");
      const identifier = testId ? Uint8Array.from(testId.match(/../g)!, byte => parseInt(byte, 16)) : crypto.getRandomValues(new Uint8Array(5));
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const trustmark = await engine.current!.encode(original, identifier, 1.5);
      const pixels = (await embedDense(trustmark, secret, "00000000-0000-4000-8000-0000000000ab", page)).pixels;
      secret.fill(0);
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

  return <main className="mx-auto w-full max-w-7xl space-y-6 px-5 pt-2 pb-8 sm:px-8 lg:px-14">
    <header className="space-y-4">
      <p className="inline-flex rounded-full border-2 border-black bg-card px-4 py-1.5 text-xs font-bold uppercase tracking-widest shadow-sm">EchoLeaks workspace</p>
      <h1 className="font-head text-6xl tracking-tight sm:text-7xl"><span className="bg-linear-to-t from-primary dark:from-primary/25 from-25% to-transparent to-25%">Scan</span></h1>
      <p className="max-w-3xl text-lg text-muted-foreground">Find which shared copy matches your screenshot. Images stay in your browser.</p>
    </header>
    <CopyLookup onChange={updateCandidates} busy={busy} />
    <div className="grid gap-7 xl:grid-cols-[1.2fr_1fr]">
      <section className={panel}>
        <h2 className="flex items-center gap-3 font-head text-2xl"><Upload aria-hidden="true" /> Add a screenshot</h2>
        <label className="block space-y-2 font-bold">PNG or JPEG image
          <input key={`e-${resetKey}`} aria-label="Screenshot image" className={field} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void load(file, "evidence"); }} />
        </label>
        <p className="text-sm text-muted-foreground">PNG or JPEG, up to 25 MiB. Select the document area if your screenshot includes browser controls.</p>
        {resizeNotice && <p role="note" className="text-sm text-muted-foreground">{resizeNotice}</p>}
        {evidence && <>
          <PixelPreview pixels={evidence} label="Screenshot preview" points={areaPoints} disabled={busy || areaPoints.length >= 2} onPoint={selectArea ? point => setAreaPoints(points => [...points,point]) : undefined} />
          <button className={secondaryButton} disabled={busy} onClick={() => {setSelectArea(value => !value);setAreaPoints([]);}}>{selectArea ? "Cancel selection" : "Select document area"}</button>
          {selectArea && <><p className="text-sm">Click the top-left and bottom-right corners of the document in your full-screen screenshot.</p><button className={button} disabled={areaPoints.length !== 2 || busy} onClick={useSelectedArea}>Use selected area</button></>}
        </>}
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy || !evidence || !geometryReady || !lookupReady} onClick={() => void analyze()}><ScanLine aria-hidden="true" size={18} />{busy ? "Processing…" : "Analyze screenshot"}</button>
          <button className={secondaryButton} onClick={reset}>Clear images</button>
        </div>
      </section>
      <section className={panel}>
        <h2 className="flex items-center gap-3 font-head text-2xl"><ShieldCheck aria-hidden="true" /> Result</h2>
        <p role="status" aria-live="polite" className="rounded-lg border-2 border-black bg-background p-4">{result && !lookupReady ? "Refreshing recipient records…" : message}</p>
        {result && <div hidden={!lookupReady} className="space-y-3" data-testid="scan-result">
          {result.status === "CANDIDATE_MATCH" && <div className="space-y-4 rounded-xl border-2 border-black bg-background p-4">
            <FingerprintMatchScore />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Copy shared with</p>
            <p className="text-xl font-bold">{candidates.find(candidate => candidate.id === result.candidateId)?.recipientName || "Recipient"}</p>
            <p className="break-all">{candidates.find(candidate => candidate.id === result.candidateId)?.recipientEmail}</p>
          </div>}
          {(result.status === "PROBABLE_MATCH" || (result.status === "INCONCLUSIVE" && result.scores?.length)) && result.scores && result.regions !== undefined && result.margin !== undefined && <RankedEvidence
            named={result.status === "PROBABLE_MATCH" ? candidates.find(candidate => candidate.id === result.candidateId)?.recipientName || "Recipient" : undefined}
            regions={result.regions} margin={result.margin}
            medianOther={result.medianOther} scalesAgreeing={result.scalesAgreeing}
            scores={result.scores.map(score => {
              const candidate = candidates.find(item => item.id === score.candidateId);
              const label = [candidate?.recipientName, candidate?.recipientEmail].filter(Boolean).join(" · ");
              return { ...score, label: label || score.candidateId };
            })} />}
          <details className="rounded-lg border-2 border-black p-3">
            <summary className="cursor-pointer rounded-lg text-sm font-bold">Scan details</summary>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              {result.status === "CANDIDATE_MATCH" && <p className="break-all">Share ID: {candidates.find(candidate => candidate.id === result.candidateId)?.shareId}</p>}
              {result.identifier && <div><p>Fingerprint ID</p><output data-testid="recovered-identifier" className="break-all font-mono text-foreground">{result.identifier}</output></div>}
              <p>{result.attempts} decode attempt{result.attempts === 1 ? "" : "s"} · {duration?.toFixed(0)} ms{result.coverage !== null ? ` · ${(result.coverage * 100).toFixed(1)}% observed coverage` : ""}</p>
            </div>
          </details>
        </div>}
      </section>
    </div>
    <details className={panel}>
      <summary className="cursor-pointer rounded-lg font-head text-xl">Advanced: original &amp; alignment</summary>
      <p className="text-sm text-muted-foreground">For a crop, choose the clean original and mark the same four points in clockwise order on both images. At least 50% of the original page must be observed. Clean fill does not count as evidence. Partial screenshots may not produce a match.</p>
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
          <button className={secondaryButton} disabled={busy} onClick={() => { setOriginalPoints(corners(original.width, original.height)); setEvidencePoints(corners(evidence.width, evidence.height)); clearResult(); }}>Use full-image corners</button>
        </div>
      </>}
    </details>
    <details className={panel}>
      <summary className="cursor-pointer rounded-lg font-head text-xl"><FlaskConical className="mr-2 inline" aria-hidden="true" /> Create a local test copy</summary>
      <p className="text-sm">Generate a test fingerprint on the original selected above, or use the public sample. This is not a shared recipient copy. Only the completed marked image is displayed here.</p>
      <div className="flex flex-wrap gap-3">
        <button className={secondaryButton} disabled={busy} onClick={() => { originalFile.current = null; setPage(1); setPageCount(1); setOriginal(syntheticPage()); setOriginalPoints([]); setAligned(false); setMarked(null); setTestId(""); clearResult(); setMessage("Public sample loaded as the original."); }}>Use public sample</button>
        <button className={button} disabled={busy || !original} onClick={() => void createTestCopy()}>Create marked test copy</button>
      </div>
      {marked && <>
        <p>Test fingerprint ID: <output data-testid="test-identifier" className="font-mono font-bold">{testId}</output></p>
        <PixelPreview pixels={marked} label="Marked test copy" />
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy} onClick={() => void saveTestCopy()}>Save test PNG</button>
          <button className={secondaryButton} disabled={busy} onClick={() => { setEvidence(marked); setEvidencePoints([]); setAligned(false); clearResult(); setMessage("Exact marked pixels selected. Analyze to test the in-memory round trip."); }}>Use marked image for scan</button>
        </div>
      </>}
    </details>
  </main>;
}
