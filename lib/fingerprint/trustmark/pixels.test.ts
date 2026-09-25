import { expect, it } from "vitest";
import { applyResidual, modelInput } from "./pixels";

it("uses RGB NCHW [-1,1], flattens alpha on white and does not mutate source", () => {
  const pixels = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
  expect(modelInput(pixels).every((value) => value === 1)).toBe(true);
  for (let i = 0; i < pixels.data.length; i += 4) pixels.data.set([255, 0, 0, 255], i);
  const input = modelInput(pixels);
  expect(input[0]).toBe(1);
  expect(input[65536]).toBe(-1);
  expect(input[131072]).toBe(-1);
  expect(applyResidual(pixels, input, input.slice(), 1).data).toEqual(pixels.data);
});

it("clips, quantizes and rejects invalid outputs and unsupported aspect ratios", () => {
  const pixels = { width: 32, height: 32, data: new Uint8ClampedArray(4096).fill(255) };
  const input = modelInput(pixels);
  expect(applyResidual(pixels, input, new Float32Array(input.length).fill(2), 1).data.every((x) => x === 255)).toBe(true);
  expect(() => applyResidual(pixels, input, new Float32Array(input.length).fill(NaN), 1)).toThrow();
  expect(() => modelInput({ width: 32, height: 128, data: new Uint8ClampedArray(32 * 128 * 4) })).toThrow(/aspect/);
});
