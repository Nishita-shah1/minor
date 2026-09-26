"use client";

import { useEffect, useRef, useState } from "react";
import { openPdfDocument } from "@/lib/fingerprint/pdf-document";
import { renderLocalFile } from "@/lib/fingerprint/lab/render";
import { BrowserFingerprintEngine } from "@/lib/fingerprint/worker-client";
import { PixelPreview } from "@/components/fingerprint/pixel-preview";
import { useViewingSession } from "@/hooks/use-viewing-session";
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
  if (!fingerprintId) {
    return (
      <section className="mt-5 rounded-xl border-2 border-black bg-card p-6">
        <h2 className="font-head text-xl">This copy needs protection</h2>
        <p>No unmarked preview is displayed. Ask the owner to enable fingerprints in History, then reopen this link.</p>
      </section>
    );
  }
  return (
    <section className="mt-5 rounded-2xl border-[3px] border-black bg-card p-4 shadow-lg sm:p-5">
      <header className="border-b-2 border-black pb-4">
        <h2 className="truncate font-head text-xl">{metadata.name}</h2>
        <p className="text-xs text-muted-foreground">
          Decrypted and fingerprinted locally · {(metadata.size / 1024).toFixed(1)} KB
        </p>
      </header>
      <DocumentPages
        bytes={bytes}
        metadata={metadata}
        fingerprintId={fingerprintId}
        shareId={shareId}
        documentId={documentId}
      />
    </section>
  );
}

function DocumentPages({
  bytes,
  metadata,
  fingerprintId,
  shareId,
  documentId,
}: Pick<Props, "bytes" | "metadata" | "fingerprintId" | "shareId" | "documentId">) {
  const root = useRef<HTMLDivElement>(null);
  const [runtime, setRuntime] = useState("");
  const [webgpuOutcome, setWebgpuOutcome] = useState<"ready" | "unavailable" | "unknown">("unknown");
  const [fitPage, setFitPage] = useState(true);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(1);
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [resolutionNotice, setResolutionNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [full, setFull] = useState(false);
  const [visible, setVisible] = useState(true);
  const pdf = useRef<Awaited<ReturnType<typeof openPdfDocument>> | null>(null);
  const engine = useRef<BrowserFingerprintEngine | null>(null);
  const [ready, setReady] = useState(false);
  const lastConfirmation = useRef(0);
  const authorizationEpoch = useRef(0);
  const session = useViewingSession(shareId, documentId, !!fingerprintId);
  const wasFull = useRef(false);
  const wasVisible = useRef(true);
  const pageRef = useRef(page);

  useEffect(() => {
    let cancelled = false;
    const inference = new BrowserFingerprintEngine((message) => {
      setPixels(null);
      setError(message);
      setAuthorized(false);
    });
    engine.current = inference;
    void (async () => {
      try {
        if (fingerprintId) {
          const info = await inference.initialize("encode");
          if (!cancelled) {
            setRuntime(info.provider === "wasm" ? "local CPU" : "WebGPU");
            setWebgpuOutcome(info.provider === "wasm" ? "unavailable" : "ready");
          }
        }
        if (metadata.type === "application/pdf" || /\.pdf$/i.test(metadata.name)) {
          const loaded = await openPdfDocument(bytes);
          if (cancelled) {
            await loaded.dispose();
            return;
          }
          pdf.current = loaded;
          setCount(loaded.pageCount);
        }
        if (!cancelled) setReady(true);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Document preparation failed.");
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      inference.cancel();
      void pdf.current?.dispose();
      pdf.current = null;
    };
  }, [bytes, fingerprintId, metadata.name, metadata.type]);

  useEffect(() => {
    if (!ready || !session.consented) return;
    let cancelled = false;
    void (async () => {
      try {
        const clean = pdf.current
          ? await pdf.current.render(page)
          : await renderLocalFile(new File([bytes], metadata.name, { type: metadata.type }), {
            onResize: (from, to) => {
              if (!cancelled) {
                setResolutionNotice(`Image fitted locally from ${from} to a ${to} marked page. Fine detail may be reduced.`);
              }
            },
          });
        if (cancelled) return;
        const output = fingerprintId ? await engine.current!.encode(clean, fingerprintId, 1) : clean;
        if (!cancelled) {
          setPixels(output);
          setBusy(false);
          session.updateObservation({ marked: true, pageIndex: page });
        }
      } catch (caught) {
        if (!cancelled) {
          setPixels(null);
          setError(caught instanceof Error ? caught.message : "Page preparation failed.");
          setBusy(false);
          session.updateObservation({ marked: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, page, bytes, fingerprintId, metadata.name, metadata.type, session.consented]);

  useEffect(() => {
    if (!fingerprintId || !session.consented) return;
    const epochRef = authorizationEpoch;
    let cancelled = false;
    let checking = false;
    const revalidate = async () => {
      if (checking || document.hidden || document.fullscreenElement !== root.current) return;
      const epoch = epochRef.current;
      checking = true;
      try {
        const response = await fetch(`/api/shares/${shareId}/documents/${documentId}/access`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (cancelled || epoch !== epochRef.current) return;
        if (!response.ok) {
          setAuthorized(false);
          setError("Access is no longer available. Close this viewer and reopen the share.");
          session.updateObservation({ authorized: false });
          return;
        }
        lastConfirmation.current = performance.now();
        setAuthorized(true);
        session.updateObservation({ authorized: true });
      } catch {
        if (!cancelled && performance.now() - lastConfirmation.current > 30000) {
          setAuthorized(false);
          session.updateObservation({ authorized: false });
        }
      } finally {
        checking = false;
      }
    };
    const cover = () => {
      epochRef.current++;
      setAuthorized(false);
      const nextVisible = !document.hidden;
      const nextFull = document.fullscreenElement === root.current;
      setVisible(nextVisible);
      setFull(nextFull);
      session.updateObservation({ visible: nextVisible, fullscreen: nextFull, authorized: false });
      if (wasVisible.current && !nextVisible) session.record("VISIBILITY_HIDDEN", { visible: false });
      if (!wasVisible.current && nextVisible) session.record("VISIBILITY_VISIBLE", { visible: true });
      if (wasFull.current && !nextFull) session.record("FULLSCREEN_EXIT", { fullscreen: false });
      if (!wasFull.current && nextFull) session.record("FULLSCREEN_ENTER", { fullscreen: true });
      if (!nextVisible || !nextFull) session.record("COVERED");
      wasVisible.current = nextVisible;
      wasFull.current = nextFull;
      void revalidate();
    };
    const deadline = setInterval(() => {
      if (performance.now() - lastConfirmation.current > 30000) {
        setAuthorized(false);
        session.updateObservation({ authorized: false });
      }
    }, 1000);
    const timer = setInterval(() => void revalidate(), 15000);
    document.addEventListener("visibilitychange", cover);
    document.addEventListener("fullscreenchange", cover);
    window.addEventListener("online", cover);
    window.addEventListener("offline", cover);
    window.addEventListener("pageshow", cover);
    window.addEventListener("pagehide", cover);
    cover();
    return () => {
      cancelled = true;
      epochRef.current++;
      clearInterval(timer);
      clearInterval(deadline);
      document.removeEventListener("visibilitychange", cover);
      document.removeEventListener("fullscreenchange", cover);
      window.removeEventListener("online", cover);
      window.removeEventListener("offline", cover);
      window.removeEventListener("pageshow", cover);
      window.removeEventListener("pagehide", cover);
    };
  }, [fingerprintId, shareId, documentId, session.consented]);

  useEffect(() => {
    if (!session.consented) return;
    if (pageRef.current !== page) {
      session.record("PAGE_CHANGED", { pageIndex: page });
      pageRef.current = page;
    }
  }, [page, session.consented]);

  if (!session.consented) {
    return (
      <div className="space-y-4 rounded-xl border-2 border-black bg-background p-5">
        <h3 className="font-head text-xl">Activity disclosure</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Before opening the protected view, EchoLeaks records disclosed viewing activity for the owner:
          estimated visible time, fullscreen enter/exit, tab or window hides, page changes, and print attempts.
          Document contents stay local. This is not used to claim someone leaked a file.
        </p>
        {session.error && <p role="alert" className="text-sm text-destructive">{session.error}</p>}
        <button
          type="button"
          disabled={session.starting}
          className="rounded-full border-2 border-black bg-primary px-5 py-2.5 font-bold text-primary-foreground shadow-sm disabled:opacity-50"
          onClick={() => void session.start(webgpuOutcome)}
        >
          {session.starting ? "Starting…" : "I understand — continue"}
        </button>
      </div>
    );
  }

  const covered = !!fingerprintId && (!authorized || !full || !visible);
  const button = "rounded-full border-2 border-black bg-primary text-primary-foreground px-4 py-2 font-bold disabled:opacity-40";
  function navigate(next: number) {
    setPixels(null);
    setBusy(true);
    setError("");
    setPage(next);
  }

  return (
    <div ref={root} className="space-y-4 overflow-auto rounded-xl bg-background p-3">
      <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
        <button className={button} disabled={busy || page <= 1} onClick={() => navigate(page - 1)}>Previous page</button>
        <span className="font-bold">Page {page} of {count}</span>
        <button className={button} onClick={() => setFitPage((value) => !value)}>{fitPage ? "Zoom to width" : "Fit page"}</button>
        <button className={button} disabled={busy || page >= count} onClick={() => navigate(page + 1)}>Next page</button>
        {fingerprintId && !full && (
          <button
            className={button}
            onClick={() => void root.current?.requestFullscreen().catch(() => setError("Fullscreen is required. Use the button to try again."))}
          >
            Open protected view
          </button>
        )}
      </div>
      <p className="text-sm">
        Experimental low-visibility fingerprint · marked on this device ({runtime || "preparing"}). Crops and phone photos are not qualified.
      </p>
      {session.error && <p role="alert" className="text-sm text-destructive">{session.error}</p>}
      {resolutionNotice && (
        <p role="note" className="text-sm">{resolutionNotice} Screenshot recovery at this size is unqualified.</p>
      )}
      <div className="print:hidden">
        {error ? (
          <p role="alert" className="rounded-xl border-2 border-black p-6 text-destructive">{error}</p>
        ) : busy || !pixels ? (
          <p role="status" className="p-10 text-center">Preparing page locally…</p>
        ) : covered ? (
          <p className="p-10 text-center">
            Document covered. Open protected view and wait for access confirmation. Check your connection if this persists.
          </p>
        ) : (
          <div
            className="mx-auto max-w-full"
            style={fitPage && pixels ? { width: `min(100%, calc((100svh - 240px) * ${pixels.width / pixels.height}))` } : { width: "100%" }}
          >
            <PixelPreview pixels={pixels} label={`Marked page ${page}`} />
          </div>
        )}
      </div>
      <p className="hidden print:block">Protected document content is unavailable for printing.</p>
    </div>
  );
}
