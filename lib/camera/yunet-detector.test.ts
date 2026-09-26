import { describe, expect, it } from "vitest";
import { countYuNetFaces, webcamTensor, type YuNetOutputs } from "./yunet-detector";

function outputs(): YuNetOutputs {
  return Object.fromEntries([8, 16, 32].flatMap(stride => {
    const n = (320 / stride) ** 2;
    return [[`cls_${stride}`, { data: new Float32Array(n) }], [`obj_${stride}`, { data: new Float32Array(n) }], [`bbox_${stride}`, { data: new Float32Array(n * 4) }]];
  })) as YuNetOutputs;
}

describe("YuNet face decoding", () => {
  it("counts distinct face boxes after non-max suppression", () => {
    const result = outputs();
    result.cls_8.data[1] = result.obj_8.data[1] = 0.9;
    result.cls_8.data[100] = result.obj_8.data[100] = 0.9;
    expect(countYuNetFaces(result)).toBe(2);
  });
  it("rejects an incompatible output shape and detects dark frames locally", () => {
    expect(() => countYuNetFaces({})).toThrow("output shape");
    expect(webcamTensor(new Uint8ClampedArray(320 * 320 * 4)).obscured).toBe(true);
    const bright = new Uint8ClampedArray(320 * 320 * 4).fill(255);
    expect(webcamTensor(bright).obscured).toBe(false);
  });
});
