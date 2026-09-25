import { openPdfDocument } from "../pdf-document";
import type { Pixels } from "../types";
import { validatePixels } from "../trustmark/pixels";
import { evidenceSurface, imageSurface } from "./image-surface";
import { validateImageSize } from "./image-size";

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
  await validateImageSize(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const fit = options.evidence ? evidenceSurface(bitmap.width, bitmap.height) : imageSurface(bitmap.width, bitmap.height);
    if (fit.fitted) options.onResize?.(`${bitmap.width} × ${bitmap.height}`, `${fit.width} × ${fit.height}`);
    const { canvas, context } = surface(fit.width, fit.height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    try {
      context.drawImage(bitmap, fit.imageX, fit.imageY, fit.imageWidth, fit.imageHeight);
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
