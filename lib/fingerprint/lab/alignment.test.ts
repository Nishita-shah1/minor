import { expect, it } from "vitest";
import { corners, reconstruct } from "./alignment";
import { investigate } from "./investigate";
import type { DecodeResult, Pixels } from "../types";

function pixels(width = 32, height = 32, value = 255): Pixels {
  const data = new Uint8ClampedArray(width * height * 4).fill(value);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}
const a = new Uint8Array([1, 2, 3, 4, 5]), b = new Uint8Array([5, 4, 3, 2, 1]);
const valid = (identifier = a): DecodeResult => ({ status: "VALID_IDENTIFIER", identifier, correctedBits: 0 });

it("identity reconstruction preserves exact pixels without mutating the original", () => {
  const source = pixels(), evidence = pixels(32, 32, 17);
  const aligned = reconstruct(source, evidence, { original: corners(32, 32), evidence: corners(32, 32) });
  expect(aligned.coverage).toBe(1);
  expect(aligned.pixels.data).toEqual(evidence.data);
  expect(source.data[0]).toBe(255);
});
it("counts the observed half only, retaining clean fill outside the crop", () => {
  const aligned = reconstruct(pixels(), pixels(16, 32, 42), { original: corners(16, 32), evidence: corners(16, 32) });
  expect(aligned.coverage).toBe(0.5);
  expect(aligned.pixels.data[0]).toBe(42);
  expect(aligned.pixels.data[31 * 4]).toBe(255);
});
it("rejects insufficient coverage, transparent evidence, crossed and degenerate geometry", () => {
  expect(() => reconstruct(pixels(), pixels(15, 32), { original: corners(15, 32), evidence: corners(15, 32) })).toThrow("UNSUPPORTED_COVERAGE");
  const transparent = pixels(); transparent.data.fill(0);
  expect(() => reconstruct(pixels(), transparent, { original: corners(32, 32), evidence: corners(32, 32) })).toThrow("UNSUPPORTED_COVERAGE");
  const quad = corners(32, 32);
  for (const original of [[quad[0], quad[2], quad[1], quad[3]], [quad[0], quad[0], quad[1], quad[2]], [{ x: NaN, y: 0 }, ...quad.slice(1)]]) {
    expect(() => reconstruct(pixels(), pixels(), { original, evidence: quad })).toThrow("INVALID_ALIGNMENT");
  }
});
it("maps a perspective quadrilateral while excluding unobserved corners", () => {
  const original = [{ x: 4, y: 0 }, { x: 28, y: 0 }, { x: 32, y: 32 }, { x: 0, y: 32 }];
  const aligned = reconstruct(pixels(), pixels(32, 32, 42), { original, evidence: corners(32, 32) });
  expect(aligned.coverage).toBeCloseTo(0.875);
  expect(aligned.pixels.data[0]).toBe(255);
  expect(aligned.pixels.data[(16 * 32 + 16) * 4]).toBe(42);
});
it("uses at most two decodes and abstains on conflicting identifiers", async () => {
  let calls = 0;
  const result = await investigate({ original: pixels(), evidence: pixels(), correspondence: { original: corners(32, 32), evidence: corners(32, 32) },
    candidates: [{ id: "alice", identifier: a }], decode: async () => valid(calls++ ? b : a) });
  expect(calls).toBe(2);
  expect(result.status).toBe("INCONCLUSIVE");
  expect(result.reason).toBe("CONFLICTING_IDENTIFIERS");
});
it("never selects a single candidate without an exact valid identifier", async () => {
  const base = { original: pixels(), evidence: pixels(), candidates: [{ id: "alice", identifier: a }] };
  expect((await investigate({ ...base, decode: async () => ({ status: "NO_RELIABLE_MARK" }) })).status).toBe("NO_RELIABLE_MARK");
  expect((await investigate({ ...base, decode: async () => valid(b) })).status).toBe("UNKNOWN_MARK");
  expect((await investigate({ ...base, decode: async () => valid(a) })).candidateId).toBe("alice");
  expect((await investigate({ ...base, candidates: [...base.candidates, { id: "bob", identifier: a }], decode: async () => valid(a) })).status).toBe("INCONCLUSIVE");
});
it("invalid coverage cannot be rescued by a direct decoded identifier", async () => {
  let calls = 0;
  const result = await investigate({ original: pixels(), evidence: pixels(), correspondence: { original: corners(8, 32), evidence: corners(32, 32) }, candidates: [{ id: "alice", identifier: a }], decode: async () => { calls++; return valid(); } });
  expect(calls).toBe(0);
  expect(result.reason).toBe("UNSUPPORTED_COVERAGE");
});
