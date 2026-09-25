import { openPdfDocument } from "../pdf-document";
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

export async function renderLocalFile(file: File, options: { evidence?: boolean; page?: number; onPageCount?: (count: number) => void; onResize?: (from: string, to: string) => void } = {}): Promise<Pixels> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Lab files must be at most 25 MiB");
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdf = await openPdfDocument(await file.arrayBuffer());
    try {
      options.onPageCount?.(pdf.pageCount);
      const pixels = await pdf.render(options.page ?? 1);
      validatePixels(pixels);
      return pixels;
    } finally { await pdf.dispose(); }
  }
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("This lab accepts PDF, PNG, and JPEG fixtures only");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const oversized = bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 4_194_304;
    if (oversized && !options.evidence) throw new Error("Original images must be at most 4 megapixels and 4096 pixels per side.");
    const scale = oversized ? Math.min(4096 / bitmap.width, 4096 / bitmap.height, Math.sqrt(4_194_304 / (bitmap.width * bitmap.height))) : 1;
    const width = Math.max(1, Math.floor(bitmap.width * scale)), height = Math.max(1, Math.floor(bitmap.height * scale));
    if (oversized) options.onResize?.(`${bitmap.width} × ${bitmap.height}`, `${width} × ${height}`);
    const { canvas, context } = surface(width, height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    try {
      context.drawImage(bitmap, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      // Evidence crops may be narrower than model input; alignment reconstructs
      // them before inference. Keep strict dimensions for original/encoding input.
      if (!options.evidence) validatePixels(pixels);
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
