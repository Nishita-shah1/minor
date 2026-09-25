import { MAX_MARKED_PIXELS, MAX_MARKED_SIDE } from "../trustmark/pixels";

export type ImageSurface = {
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  imageX: number;
  imageY: number;
  fitted: boolean;
};

// TrustMark operates on bounded page pixels. Fit the whole source into that page,
// adding white margins for panoramas instead of discarding image content.
export function imageSurface(width: number, height: number): ImageSurface {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("The image has invalid dimensions.");
  }
  const frameWidth = Math.max(width, height / 2);
  const frameHeight = Math.max(height, width / 2);
  const scale = Math.min(
    Math.max(1, 32 / Math.min(width, height)),
    MAX_MARKED_SIDE / frameWidth,
    MAX_MARKED_SIDE / frameHeight,
    Math.sqrt((MAX_MARKED_PIXELS - 8192) / (frameWidth * frameHeight)),
  );
  const imageWidth = Math.max(1, Math.floor(width * scale));
  const imageHeight = Math.max(1, Math.floor(height * scale));
  const canvasWidth = Math.max(32, imageWidth, Math.ceil(imageHeight / 2));
  const canvasHeight = Math.max(32, imageHeight, Math.ceil(imageWidth / 2));
  if (canvasWidth > MAX_MARKED_SIDE || canvasHeight > MAX_MARKED_SIDE || canvasWidth * canvasHeight > MAX_MARKED_PIXELS) {
    throw new Error("This image exceeds the browser's safe marked-surface size.");
  }
  return {
    width: canvasWidth,
    height: canvasHeight,
    imageWidth,
    imageHeight,
    imageX: Math.floor((canvasWidth - imageWidth) / 2),
    imageY: Math.floor((canvasHeight - imageHeight) / 2),
    fitted: canvasWidth !== width || canvasHeight !== height,
  };
}

// Evidence stays unpadded so its pixel coordinates still match manual alignment.
export function evidenceSurface(width: number, height: number): ImageSurface {
  const scale = Math.min(1, MAX_MARKED_SIDE / width, MAX_MARKED_SIDE / height,
    Math.sqrt(MAX_MARKED_PIXELS / (width * height)));
  const imageWidth = Math.max(1, Math.floor(width * scale));
  const imageHeight = Math.max(1, Math.floor(height * scale));
  return { width: imageWidth, height: imageHeight, imageWidth, imageHeight,
    imageX: 0, imageY: 0, fitted: imageWidth !== width || imageHeight !== height };
}
