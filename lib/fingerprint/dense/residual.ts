import type { Pixels } from "../types";

export function luminance(pixels: Pixels): Float32Array {
  const count = pixels.width * pixels.height;
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    values[i] = 0.2126 * pixels.data[offset] + 0.7152 * pixels.data[offset + 1] + 0.0722 * pixels.data[offset + 2];
  }
  return values;
}

function integral(values: Float32Array, width: number, height: number, squares = false): Float64Array {
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const sample = values[y * width + x];
      row += squares ? sample * sample : sample;
      sums[(y + 1) * (width + 1) + (x + 1)] = row + sums[y * (width + 1) + (x + 1)];
    }
  }
  return sums;
}

function rect(sums: Float64Array, width: number, x0: number, y0: number, x1: number, y1: number) {
  const stride = width + 1;
  return sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
}

export function boxStats(values: Float32Array, width: number, height: number, window: number) {
  const radius = Math.floor(window / 2);
  const sum = integral(values, width, height);
  const square = integral(values, width, height, true);
  const mean = new Float32Array(values.length);
  const deviation = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const count = (x1 - x0) * (y1 - y0);
      const average = rect(sum, width, x0, y0, x1, y1) / count;
      const energy = rect(square, width, x0, y0, x1, y1) / count;
      const index = y * width + x;
      mean[index] = average;
      deviation[index] = Math.sqrt(Math.max(0, energy - average * average));
    }
  }
  return { mean, deviation };
}

export function normalizedResidual(pixels: Pixels, period: number) {
  const gray = luminance(pixels);
  const high = boxStats(gray, pixels.width, pixels.height, 5);
  const contrast = boxStats(gray, pixels.width, pixels.height, Math.max(5, Math.floor(period / 4)));
  const values = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) values[i] = (gray[i] - high.mean[i]) / Math.max(1, contrast.deviation[i]);
  return { gray, values };
}
