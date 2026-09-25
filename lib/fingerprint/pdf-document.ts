import type { Pixels } from "./types";

// One PDF document and one page surface at a time. Call dispose on closure.
export async function openPdfDocument(bytes: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  const assets = "/fingerprint-assets/pdfjs-6.3.289/";
  pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
  const loading = pdfjs.getDocument({ data: bytes.slice(0), useSystemFonts: false,
    standardFontDataUrl: `${assets}standard_fonts/`, cMapUrl: `${assets}cmaps/`, cMapPacked: true, wasmUrl: `${assets}wasm/` });
  try {
    const document = await loading.promise;
    return {
      pageCount: document.numPages,
      async render(pageNumber: number): Promise<Pixels> {
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) throw new Error("Choose a valid PDF page.");
        const page = await document.getPage(pageNumber);
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 1536 / Math.max(natural.width, natural.height) });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas is unavailable");
          await page.render({ canvas, canvasContext: context, viewport, background: "white" }).promise;
          return context.getImageData(0, 0, canvas.width, canvas.height);
        } finally { canvas.width = canvas.height = 0; page.cleanup(); }
      },
      dispose: () => loading.destroy(),
    };
  } catch (error) { await loading.destroy(); throw error; }
}
