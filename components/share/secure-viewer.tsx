"use client";

import { Download, FileQuestion } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileMetadata } from "@/lib/crypto/types";

type Props = {
  shareId: string;
  permission: "VIEW_ONLY" | "VIEW_AND_DOWNLOAD";
  metadata: FileMetadata;
  bytes: ArrayBuffer;
};

const sourceExtensions = /\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yaml|yml|csv|log)$/i;

export function SecureViewer({ shareId, permission, metadata, bytes }: Props) {
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
        {permission === "VIEW_AND_DOWNLOAD" && <button type="button" onClick={download} className="flex items-center gap-2 rounded-full border-2 border-black bg-primary px-4 py-2 font-bold shadow-sm"><Download className="size-4" /> Download</button>}
      </div>
      <div className="mt-4 min-h-72 overflow-auto rounded-xl border-2 border-black bg-background p-3">
        {/* A decrypted local Blob URL cannot be optimized by next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {isImage && url ? <img src={url} alt={metadata.name} className="mx-auto max-h-[70svh] max-w-full object-contain" /> : null}
        {isPdf ? <PdfPreview bytes={bytes} /> : null}
        {isText ? <pre className="whitespace-pre-wrap break-words font-mono text-sm">{new TextDecoder().decode(bytes)}</pre> : null}
        {!isImage && !isPdf && !isText && <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"><FileQuestion className="size-10" /><p className="font-head text-xl">Preview not supported</p><p className="max-w-md text-sm text-muted-foreground">{permission === "VIEW_AND_DOWNLOAD" ? "This format is still protected and can be downloaded locally." : "View-only mode cannot securely preview this format yet."}</p></div>}
      </div>
      {permission === "VIEW_ONLY" && <p className="mt-3 text-xs text-muted-foreground">View-only mode removes the download control, but browser viewing is deterrence—not perfect DRM or screenshot prevention.</p>}
    </section>
  );
}

function PdfPreview({ bytes }: { bytes: ArrayBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const document = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
        const page = await document.getPage(1);
        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setError("PDF preview could not be rendered.");
      }
    })();
    return () => { cancelled = true; };
  }, [bytes]);

  if (error) return <p className="p-6 text-center font-bold text-destructive">{error}</p>;
  return <canvas ref={canvasRef} className="mx-auto max-w-full" aria-label="First page of decrypted PDF" />;
}
