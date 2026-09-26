import { DENSE_PERIODS, DENSE_PHASES, type DensePhase } from "./profile";

const label = "EchoLeaks/dense-crop/v1";

export const PILOT_DOCUMENT = "echoleaks-sync-pilot";
export const PILOT_SECRET = Uint8Array.from({ length: 32 }, (_, index) => (index * 17 + 9) & 255);

function mod(value: number, period: number) {
  return ((value % period) + period) % period;
}

export async function carrierBlock(secret: Uint8Array, documentId: string, page: number, period: number, phase: DensePhase): Promise<Int8Array> {
  if (secret.length !== 32 || !Number.isInteger(page) || page < 1 || !(DENSE_PERIODS as readonly number[]).includes(period) || !DENSE_PHASES.includes(phase)) {
    throw new Error("DenseCrop carrier inputs are invalid");
  }
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = new TextEncoder().encode([label, documentId, String(page), String(period), phase].join("\0"));
  const block = new Int8Array(period * period);
  let filled = 0;
  let counter = 0;
  while (filled < block.length) {
    const message = new Uint8Array(prefix.length + 4);
    message.set(prefix);
    new DataView(message.buffer).setUint32(prefix.length, counter);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
    for (const byte of mac) {
      if (filled >= block.length) break;
      block[filled++] = byte & 128 ? 1 : -1;
    }
    counter += 1;
  }
  return block;
}

export type CarrierField = { period: number; zero: Int8Array; half: Int8Array };

export async function carrierFields(secret: Uint8Array, documentId: string, page: number, periods: readonly number[] = DENSE_PERIODS): Promise<CarrierField[]> {
  const fields: CarrierField[] = [];
  for (const period of periods) {
    fields.push({
      period,
      zero: await carrierBlock(secret, documentId, page, period, "0"),
      half: await carrierBlock(secret, documentId, page, period, "half"),
    });
  }
  return fields;
}

/** Repeating field in [-1, 1]. The same sample returns one period away. */
export function carrierAt(fields: readonly CarrierField[], x: number, y: number, shiftX = 0, shiftY = shiftX): number {
  let sum = 0;
  for (const field of fields) {
    const period = field.period;
    const sx = x + shiftX;
    const sy = y + shiftY;
    const x0 = mod(sx, period);
    const y0 = mod(sy, period);
    const x1 = mod(sx - period / 2, period);
    const y1 = mod(sy - period / 2, period);
    sum += (field.zero[y0 * period + x0] + field.half[y1 * period + x1]) / 2;
  }
  return sum / fields.length;
}
