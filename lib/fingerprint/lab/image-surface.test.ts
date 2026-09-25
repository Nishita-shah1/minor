import { expect, it } from "vitest";
import { evidenceSurface, imageSurface } from "./image-surface";

it("keeps ordinary images at their original size", () => {
  expect(imageSurface(1024, 768)).toMatchObject({
    width: 1024, height: 768, imageWidth: 1024, imageHeight: 768,
    imageX: 0, imageY: 0, fitted: false,
  });
});

it.each([[6000, 4000], [12000, 2000], [2000, 12000], [1, 1], [20000, 20000]])(
  "fits the whole %i by %i image into a safe marked page",
  (sourceWidth, sourceHeight) => {
    const frame = imageSurface(sourceWidth, sourceHeight);
    expect(frame.width).toBeLessThanOrEqual(4096);
    expect(frame.height).toBeLessThanOrEqual(4096);
    expect(frame.width * frame.height).toBeLessThanOrEqual(4_194_304);
    expect(frame.width / frame.height).toBeGreaterThanOrEqual(0.5);
    expect(frame.width / frame.height).toBeLessThanOrEqual(2);
    expect(frame.imageX + frame.imageWidth).toBeLessThanOrEqual(frame.width);
    expect(frame.imageY + frame.imageHeight).toBeLessThanOrEqual(frame.height);
    expect(frame.fitted).toBe(true);
  },
);

it("rejects invalid dimensions before allocating a canvas", () => {
  expect(() => imageSurface(0, 100)).toThrow(/invalid dimensions/);
  expect(() => imageSurface(Number.POSITIVE_INFINITY, 100)).toThrow(/invalid dimensions/);
});

it("keeps evidence coordinates unpadded", () => {
  const fit = evidenceSurface(6000, 4000);
  expect(fit.width).toBe(fit.imageWidth);
  expect(fit.height).toBe(fit.imageHeight);
  expect(fit.imageX).toBe(0);
  expect(fit.imageY).toBe(0);
});
