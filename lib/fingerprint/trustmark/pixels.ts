import type { Pixels } from "../types";

export const MODEL_SIDE = 256;
export const MAX_MARKED_SIDE = 4096;
export const MAX_MARKED_PIXELS = 4_194_304;
const PLANE = MODEL_SIDE * MODEL_SIDE;

export function frameEvidence(pixels: Pixels): Pixels {
  const { width, height, data } = pixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || data.length !== width * height * 4) {
    throw new Error("The marked page exceeds the browser's safe working surface.");
  }
  const aspect = width / height;
  if (aspect >= 0.5 && aspect <= 2 && width <= MAX_MARKED_SIDE && height <= MAX_MARKED_SIDE && width * height <= MAX_MARKED_PIXELS) {
    validatePixels(pixels);
    return pixels;
  }
  let cropWidth = width;
  let cropHeight = height;
  let cropX = 0;
  let cropY = 0;
  if (aspect > 2) {
    cropWidth = Math.max(32, Math.floor(height * 2));
    cropX = Math.max(0, Math.floor((width - cropWidth) / 2));
  } else if (aspect < 0.5) {
    cropHeight = Math.max(32, Math.floor(width * 2));
    cropY = Math.max(0, Math.floor((height - cropHeight) / 2));
  }
  cropWidth = Math.min(cropWidth, width);
  cropHeight = Math.min(cropHeight, height);
  const framed = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y++) {
    framed.set(data.subarray(((cropY + y) * width + cropX) * 4, ((cropY + y) * width + cropX + cropWidth) * 4), y * cropWidth * 4);
  }
  const result = { width: cropWidth, height: cropHeight, data: framed };
  validatePixels(result);
  return result;
}

export function validatePixels(pixels: Pixels): void {
  const { width, height, data } = pixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width > MAX_MARKED_SIDE || height > MAX_MARKED_SIDE || width * height > MAX_MARKED_PIXELS || data.length !== width * height * 4) {
    throw new Error("The marked page exceeds the browser's safe working surface.");
  }
  if (width / height < 0.5 || width / height > 2) {
    throw new Error("This experimental profile supports aspect ratios from 1:2 to 2:1; center-only marking is disabled");
  }
}

function interpolate(read: (x: number, y: number) => number, x: number, y: number, width: number, height: number): number {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
  const dx = x - x0, dy = y - y0;
  return (read(x0, y0) * (1 - dx) + read(x1, y0) * dx) * (1 - dy)
    + (read(x0, y1) * (1 - dx) + read(x1, y1) * dx) * dy;
}

// Experimental ONNX/Rust-style input range and half-pixel bilinear coordinates.
// Not claimed pixel-identical to Adobe's other renderer implementations.
export function modelInput(pixels: Pixels): Float32Array<ArrayBuffer> {
  validatePixels(pixels);
  const output = new Float32Array(PLANE * 3);
  for (let channel = 0; channel < 3; channel++) {
    const read = (x: number, y: number) => {
      const i = (y * pixels.width + x) * 4;
      const alpha = pixels.data[i + 3] / 255;
      return (pixels.data[i + channel] * alpha + 255 * (1 - alpha)) / 127.5 - 1;
    };
    for (let y = 0; y < MODEL_SIDE; y++) for (let x = 0; x < MODEL_SIDE; x++) {
      output[channel * PLANE + y * MODEL_SIDE + x] = interpolate(read,
        (x + 0.5) * pixels.width / MODEL_SIDE - 0.5,
        (y + 0.5) * pixels.height / MODEL_SIDE - 0.5, pixels.width, pixels.height);
    }
  }
  return output;
}

export function applyResidual(pixels: Pixels, input: Float32Array, prediction: Float32Array, strength: number): Pixels {
  validatePixels(pixels);
  if (![0.8, 1, 1.25, 1.5].includes(strength) || input.length !== PLANE * 3 || prediction.length !== input.length || prediction.some((x) => !Number.isFinite(x))) {
    throw new Error("Invalid model output or experimental strength");
  }
  const residual = Float32Array.from(prediction, (x, i) => Math.max(-0.2, Math.min(0.2, strength * (x - input[i]))));
  const data = new Uint8ClampedArray(pixels.data.length);
  for (let channel = 0; channel < 3; channel++) {
    const read = (x: number, y: number) => residual[channel * PLANE + y * MODEL_SIDE + x];
    for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
      const i = (y * pixels.width + x) * 4;
      const alpha = pixels.data[i + 3] / 255;
      const original = pixels.data[i + channel] * alpha + 255 * (1 - alpha);
      const delta = interpolate(read, (x + 0.5) * MODEL_SIDE / pixels.width - 0.5,
        (y + 0.5) * MODEL_SIDE / pixels.height - 0.5, MODEL_SIDE, MODEL_SIDE);
      data[i + channel] = Math.max(0, Math.min(255, Math.round(original + delta * 127.5)));
      data[i + 3] = 255;
    }
  }
  return { width: pixels.width, height: pixels.height, data };
}
