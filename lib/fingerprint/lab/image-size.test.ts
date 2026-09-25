import { expect, it } from "vitest";
import { validateImageSize } from "./image-size";

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return new File([bytes], "image.png", { type: "image/png" });
}

it("accepts a large but bounded original before decoding", async () => {
  await expect(validateImageSize(png(6000, 4000))).resolves.toBeUndefined();
});

it("rejects a compressed oversized original before decoding", async () => {
  await expect(validateImageSize(png(12000, 12000))).rejects.toThrow(/too large to decode safely/);
});

it("reads JPEG frame dimensions before decoding", async () => {
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x0f, 0xa0, 0x17, 0x70])], "image.jpg", { type: "image/jpeg" });
  await expect(validateImageSize(jpeg)).resolves.toBeUndefined();
});
