import type { Pixels } from "../types";
import { validatePixels } from "../trustmark/pixels";

function surface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  context.fillStyle = "white"; context.fillRect(0, 0, width, height);
  return { canvas, context };
}

export async function renderLocalFile(file: File): Promise<Pixels> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Lab files must be at most 25 MiB");
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const document = await loading.promise;
      const page = await document.getPage(1);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 1536 / Math.max(natural.width, natural.height) });
      const { canvas, context } = surface(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvas, canvasContext: context, viewport, background: "white" }).promise;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        validatePixels(pixels);
        return pixels;
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    } finally { await loading.destroy(); }
  }
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("This lab accepts PDF, PNG, and JPEG fixtures only");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 4_194_304) throw new Error("Evidence must be at most 4 megapixels and 4096 pixels per side; the lab will not silently resize it");
    const { canvas, context } = surface(bitmap.width, bitmap.height);
    try {
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      validatePixels(pixels);
      return pixels;
    } finally { canvas.width = canvas.height = 0; }
  } finally { bitmap.close(); }
}

export function syntheticPage(): Pixels {
  const { canvas, context } = surface(768, 1024);
  context.fillStyle = "#111";
  context.font = "bold 32px sans-serif";
  context.fillText("PUBLIC TEST FIXTURE", 48, 70);
  context.font = "18px sans-serif";
  for (let line = 0; line < 28; line++) {
    context.fillText(`Reference row ${String(line + 1).padStart(2, "0")} — amount ${(line * 17.31).toFixed(2)} — local pixels`, 48, 125 + line * 28);
  }
  context.fillStyle = "#b7d8da"; context.fillRect(48, 930, 672, 36);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  return pixels;
}
