const MAX_SOURCE_PIXELS = 24_000_000;
const MAX_SOURCE_SIDE = 12_000;

function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Invalid JPEG image.");
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("Invalid JPEG image.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) break;
      return { height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
    }
    offset += length;
  }
  throw new Error("JPEG dimensions are unavailable.");
}

export async function validateImageSize(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let width: number, height: number;
  if (file.type === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value) ||
      String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") throw new Error("Invalid PNG image.");
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    width = view.getUint32(16); height = view.getUint32(20);
  } else {
    ({ width, height } = jpegSize(bytes));
  }
  if (width < 1 || height < 1) throw new Error("The image has invalid dimensions.");
  if (width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE || width * height > MAX_SOURCE_PIXELS) {
    throw new Error("This source image is too large to decode safely on this device (24 megapixels or 12000 pixels per side). The file was not opened.");
  }
}
