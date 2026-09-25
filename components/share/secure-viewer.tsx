"use client";

import { useEffect, useRef, useState } from "react";
import { openPdfDocument } from "@/lib/fingerprint/pdf-document";
import { renderLocalFile } from "@/lib/fingerprint/lab/render";
import { BrowserFingerprintEngine } from "@/lib/fingerprint/worker-client";
import { PixelPreview } from "@/components/fingerprint/pixel-preview";
import type { Pixels } from "@/lib/fingerprint/types";
import type { FileMetadata } from "@/lib/crypto/types";

type Props = {
  shareId: string;
  documentId: string;
  fingerprintId?: Uint8Array;
  permission: "VIEW_ONLY" | "VIEW_AND_DOWNLOAD";
  metadata: FileMetadata;
  bytes: ArrayBuffer;
};

export function SecureViewer({ shareId, documentId, fingerprintId, metadata, bytes }: Props) {
  if (!fingerprintId) return <section className="mt-5 rounded-xl border-2 border-black bg-card p-6"><h2 className="font-head text-xl">This copy needs protection</h2><p>No unmarked preview is displayed. Ask the owner to enable fingerprints in History, then reopen this link.</p></section>;
  return <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-lg sm:p-5">
    <header className="border-b-2 border-black pb-4"><h2 className="truncate font-head text-xl">{metadata.name}</h2><p className="text-xs text-muted-foreground">Decrypted and fingerprinted locally · {(metadata.size / 1024).toFixed(1)} KB</p></header>
    <DocumentPages bytes={bytes} metadata={metadata} fingerprintId={fingerprintId} shareId={shareId} documentId={documentId} />
  </section>;
}

function DocumentPages({ bytes, metadata, fingerprintId, shareId, documentId }: Pick<Props, "bytes" | "metadata" | "fingerprintId" | "shareId" | "documentId">) {
  const root = useRef<HTMLDivElement>(null);
  const [runtime, setRuntime] = useState("");
  const [fitPage, setFitPage] = useState(true);
  const [page, setPage] = useState(1), [count, setCount] = useState(1);
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [resolutionNotice, setResolutionNotice] = useState("");
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(!fingerprintId);
  const [full, setFull] = useState(false);
  const [visible, setVisible] = useState(true);
  const pdf = useRef<Awaited<ReturnType<typeof openPdfDocument>> | null>(null);
  const engine = useRef<BrowserFingerprintEngine | null>(null);
  const [ready, setReady] = useState(false);
  const lastConfirmation = useRef(0), authorizationEpoch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const inference = new BrowserFingerprintEngine(message => { setPixels(null); setError(message); setAuthorized(false); });
    engine.current = inference;
    void (async () => {
      try {
        if (fingerprintId) { const info = await inference.initialize("encode"); if (!cancelled) setRuntime(info.provider === "wasm" ? "local CPU" : "WebGPU"); }
        if (metadata.type === "application/pdf" || /\.pdf$/i.test(metadata.name)) {
          const loaded = await openPdfDocument(bytes);
          if (cancelled) { await loaded.dispose(); return; }
          pdf.current = loaded; setCount(loaded.pageCount);
        }
        if (!cancelled) setReady(true);
      } catch (caught) { if (!cancelled) { setError(caught instanceof Error ? caught.message : "Document preparation failed."); setBusy(false); } }
    })();
    return () => { cancelled = true; inference.cancel(); void pdf.current?.dispose(); pdf.current = null; };
  }, [bytes, fingerprintId, metadata.name, metadata.type]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const clean = pdf.current ? await pdf.current.render(page) : await renderLocalFile(new File([bytes], metadata.name, { type: metadata.type }), {
          onResize: (from, to) => { if (!cancelled) setResolutionNotice(`Image fitted locally from ${from} to a ${to} marked page. Fine detail may be reduced.`); },
        });
        if (cancelled) return;
        const output = fingerprintId ? await engine.current!.encode(clean, fingerprintId, 1) : clean;
        if (!cancelled) { setPixels(output); setBusy(false); }
      } catch (caught) { if (!cancelled) { setPixels(null); setError(caught instanceof Error ? caught.message : "Page preparation failed."); setBusy(false); } }
    })();
    return () => { cancelled = true; };
  }, [ready, page, bytes, fingerprintId, metadata.name, metadata.type]);

  useEffect(() => {
    if (!fingerprintId) return;
    const epochRef = authorizationEpoch;
    let cancelled = false, checking = false;
    const revalidate = async () => {
      if (checking || document.hidden || document.fullscreenElement !== root.current) return;
      const epoch = epochRef.current;
      checking = true;
      try {
        const response = await fetch(`/api/shares/${shareId}/documents/${documentId}/access`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (cancelled || epoch !== epochRef.current) return;
        if (!response.ok) { setAuthorized(false); setError("Access is no longer available. Close this viewer and reopen the share."); return; }
        lastConfirmation.current = performance.now(); setAuthorized(true);
      } catch { if (!cancelled && performance.now() - lastConfirmation.current > 30000) setAuthorized(false); }
      finally { checking = false; }
    };
    const cover = () => {
      epochRef.current++; setAuthorized(false);
      setVisible(!document.hidden); setFull(document.fullscreenElement === root.current);
      void revalidate();
    };
    const deadline = setInterval(() => { if (performance.now() - lastConfirmation.current > 30000) setAuthorized(false); }, 1000);
    const timer = setInterval(() => void revalidate(), 15000);
    document.addEventListener("visibilitychange", cover); document.addEventListener("fullscreenchange", cover);
    window.addEventListener("online", cover); window.addEventListener("offline", cover);
    window.addEventListener("pageshow", cover); window.addEventListener("pagehide", cover);
    return () => { cancelled = true; epochRef.current++; clearInterval(timer); clearInterval(deadline); document.removeEventListener("visibilitychange", cover); document.removeEventListener("fullscreenchange", cover); window.removeEventListener("online", cover); window.removeEventListener("offline", cover); window.removeEventListener("pageshow", cover); window.removeEventListener("pagehide", cover); };
  }, [fingerprintId, shareId, documentId]);
  const covered = !!fingerprintId && (!authorized || !full || !visible);
  const button = "rounded-full border-2 border-black bg-primary text-primary-foreground px-4 py-2 font-bold disabled:opacity-40";
  function navigate(next: number) { setPixels(null); setBusy(true); setError(""); setPage(next); }
  return <div ref={root} className="space-y-4 overflow-auto rounded-xl bg-background p-3">
    <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
      <button className={button} disabled={busy || page <= 1} onClick={() => navigate(page - 1)}>Previous page</button>
      <span className="font-bold">Page {page} of {count}</span>
      <button className={button} onClick={() => setFitPage(value => !value)}>{fitPage ? "Zoom to width" : "Fit page"}</button>
      <button className={button} disabled={busy || page >= count} onClick={() => navigate(page + 1)}>Next page</button>
      {fingerprintId && !full && <button className={button} onClick={() => void root.current?.requestFullscreen().catch(() => setError("Fullscreen is required. Use the button to try again."))}>Open protected view</button>}
    </div>
    {fingerprintId ? <p className="text-sm">Experimental low-visibility fingerprint · marked on this device ({runtime}). Crops and phone photos are not qualified.</p> : <p className="text-sm">Legacy preview — this copy has no TrustMark fingerprint.</p>}
    {resolutionNotice && <p role="note" className="text-sm">{resolutionNotice} Screenshot recovery at this size is unqualified.</p>}
    <div className="print:hidden">
      {error ? <p role="alert" className="rounded-xl border-2 border-black p-6 text-destructive">{error}</p> : busy || !pixels ? <p role="status" className="p-10 text-center">Preparing page locally…</p> : covered ? <p className="p-10 text-center">Document covered. Open protected view and wait for access confirmation. Check your connection if this persists.</p> : <div className="mx-auto max-w-full" style={fitPage && pixels ? {width: `min(100%, calc((100svh - 240px) * ${pixels.width / pixels.height}))`} : {width: "100%"}}><PixelPreview pixels={pixels} label={fingerprintId ? `Marked page ${page}` : `PDF page ${page}`} /></div>}
    </div>
    <p className="hidden print:block">Protected document content is unavailable for printing.</p>
  </div>;
}
