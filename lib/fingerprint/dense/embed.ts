import type { Pixels } from "../types";
import { carrierAt, carrierFields, PILOT_DOCUMENT, PILOT_SECRET } from "./carrier";
import { chipSize, DENSE_PERIODS, IDENTITY_MIX, PILOT_MIX, PILOT_PERIOD, SCALE_WEIGHT, steppedAmplitude } from "./profile";
import { boxStats, luminance } from "./residual";

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export async function denseOffsets(pixels: Pixels, secret: Uint8Array, documentId: string, page: number, periods: readonly number[] = DENSE_PERIODS) {
  const fields = await carrierFields(secret, documentId, page, periods);
  const pilot = await carrierFields(PILOT_SECRET, PILOT_DOCUMENT, 1, [PILOT_PERIOD]);
  const { deviation } = boxStats(luminance(pixels), pixels.width, pixels.height, 5);
  const offset = new Float32Array(pixels.width * pixels.height);
  const pilotChip = chipSize(PILOT_PERIOD);
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      let identity = 0;
      let weight = 0;
      for (const field of fields) {
        const chip = chipSize(field.period);
        const sample = carrierAt([field], Math.floor(x / chip) * chip, Math.floor(y / chip) * chip);
        const scale = SCALE_WEIGHT[field.period] ?? 1;
        identity += scale * sample;
        weight += scale;
      }
      const sync = carrierAt(pilot, Math.floor(x / pilotChip) * pilotChip, Math.floor(y / pilotChip) * pilotChip);
      const mixed = weight ? (IDENTITY_MIX * identity) / weight + PILOT_MIX * sync : PILOT_MIX * sync;
      offset[y * pixels.width + x] = steppedAmplitude(deviation[y * pixels.width + x]) * mixed;
    }
  }
  return offset;
}

export function applyOffsets(pixels: Pixels, offset: Float32Array): Pixels {
  const data = new Uint8ClampedArray(pixels.data);
  for (let i = 0; i < offset.length; i++) {
    const delta = offset[i];
    if (!delta) continue;
    const index = i * 4;
    data[index] = clampByte(data[index] + delta);
    data[index + 1] = clampByte(data[index + 1] + delta);
    data[index + 2] = clampByte(data[index + 2] + delta);
  }
  return { width: pixels.width, height: pixels.height, data };
}

export async function embedDense(pixels: Pixels, secret: Uint8Array, documentId: string, page: number, periods?: readonly number[]) {
  const offset = await denseOffsets(pixels, secret, documentId, page, periods);
  return { pixels: applyOffsets(pixels, offset), offset };
}
