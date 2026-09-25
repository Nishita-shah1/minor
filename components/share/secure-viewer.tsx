"use client";

import { Download, FileQuestion } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

const sourceExtensions = /\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yaml|yml|csv|log)$/i;

export function SecureViewer({ shareId, documentId, fingerprintId, permission, metadata, bytes }: Props) {
  const blob = useMemo(() => new Blob([bytes], { type: metadata.type }), [bytes, metadata.type]);
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  const isImage = metadata.type.startsWith("image/");
  const isPdf = metadata.type === "application/pdf" || metadata.name.toLowerCase().endsWith(".pdf");
  const isText = metadata.type.startsWith("text/") || sourceExtensions.test(metadata.name);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const download = () => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = metadata.name;
    anchor.click();
    void fetch(`/api/shares/${shareId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "DOWNLOAD_REQUESTED" }),
    });
  };

  return (
    <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-lg sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-4">
        <div className="min-w-0"><h2 className="truncate font-head text-xl">{metadata.name}</h2><p className="text-xs text-muted-foreground">Decrypted locally · {(metadata.size / 1024).toFixed(1)} KB</p></div>
        {!fingerprintId && permission === "VIEW_AND_DOWNLOAD" && <button type="button" onClick={download} className="flex items-center gap-2 rounded-full border-2 border-black bg-primary px-4 py-2 font-bold shadow-sm"><Download className="size-4" /> Download</button>}
      </div>
      <div className="mt-4 min-h-72 overflow-auto rounded-xl border-2 border-black bg-background p-3">
        {/* A decrypted local Blob URL cannot be optimized by next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!fingerprintId && isImage && url ? <img src={url} alt={metadata.name} className="mx-auto max-h-[70svh] max-w-full object-contain" /> : null}
        {isPdf || fingerprintId ? <DocumentPages bytes={bytes} metadata={metadata} fingerprintId={fingerprintId} shareId={shareId} documentId={documentId} /> : null}
        {!fingerprintId && isText ? <pre className="whitespace-pre-wrap break-words font-mono text-sm">{new TextDecoder().decode(bytes)}</pre> : null}
        {!fingerprintId && !isImage && !isPdf && !isText && <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"><FileQuestion className="size-10" /><p className="font-head text-xl">Preview not supported</p><p className="max-w-md text-sm text-muted-foreground">{permission === "VIEW_AND_DOWNLOAD" ? "This format is still protected and can be downloaded locally." : "View-only mode cannot securely preview this format yet."}</p></div>}
      </div>
      {permission === "VIEW_ONLY" && <p className="mt-3 text-xs text-muted-foreground">View-only mode removes the download control, but browser viewing is deterrence—not perfect DRM or screenshot prevention.</p>}
    </section>
  );
}

function DocumentPages({ bytes, metadata, fingerprintId, shareId, documentId }: Pick<Props, "bytes" | "metadata" | "fingerprintId" | "shareId" | "documentId">) {
  const root = useRef<HTMLDivElement>(null);
  const [fitPage, setFitPage] = useState(true);
  const [page, setPage] = useState(1), [count, setCount] = useState(1);
  const [pixels, setPixels] = useState<Pixels | null>(null);
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
        if (fingerprintId) await inference.initialize("encode");
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
        const clean = pdf.current ? await pdf.current.render(page) : await renderLocalFile(new File([bytes], metadata.name, { type: metadata.type }));
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
    window.addEventListener("pageshow", cover); window.addEventListener("pagehide", cover);
    return () => { cancelled = true; epochRef.current++; clearInterval(timer); clearInterval(deadline); document.removeEventListener("visibilitychange", cover); document.removeEventListener("fullscreenchange", cover); window.removeEventListener("pageshow", cover); window.removeEventListener("pagehide", cover); };
  }, [fingerprintId, shareId, documentId]);
  const covered = !!fingerprintId && (!authorized || !full || !visible);
  const button = "rounded-full border-2 border-black bg-primary px-4 py-2 font-bold disabled:opacity-40";
  function navigate(next: number) { setPixels(null); setBusy(true); setError(""); setPage(next); }
  return <div ref={root} className="space-y-4 overflow-auto rounded-xl bg-background p-3">
    <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
      <button className={button} disabled={busy || page <= 1} onClick={() => navigate(page - 1)}>Previous page</button>
      <span className="font-bold">Page {page} of {count}</span>
      <button className={button} onClick={() => setFitPage(value => !value)}>{fitPage ? "Zoom to width" : "Fit page"}</button>
      <button className={button} disabled={busy || page >= count} onClick={() => navigate(page + 1)}>Next page</button>
      {fingerprintId && !full && <button className={button} onClick={() => void root.current?.requestFullscreen().catch(() => setError("Fullscreen is required. Use the button to try again."))}>Open protected view</button>}
    </div>
    {fingerprintId ? <p className="text-sm">Experimental low-visibility fingerprint · marked on this device. Crops and phone photos are not qualified.</p> : <p className="text-sm">Legacy preview — this copy has no TrustMark fingerprint.</p>}
    <div className="print:hidden">
      {error ? <p role="alert" className="rounded-xl border-2 border-black p-6 text-destructive">{error}</p> : busy || !pixels ? <p role="status" className="p-10 text-center">Preparing page locally…</p> : covered ? <p className="p-10 text-center">Document covered. Open protected view and wait for access confirmation. Check your connection if this persists.</p> : <div className="mx-auto max-w-full" style={fitPage && pixels ? {width: `min(100%, calc((100svh - 240px) * ${pixels.width / pixels.height}))`} : {width: "100%"}}><PixelPreview pixels={pixels} label={fingerprintId ? `Marked page ${page}` : `PDF page ${page}`} /></div>}
    </div>
    <p className="hidden print:block">Protected document content is unavailable for printing.</p>
  </div>;
}
