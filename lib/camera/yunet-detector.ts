// YuNet postprocessing follows OpenCV FaceDetectorYN: three strides, sqrt(cls*obj), then NMS.
// https://github.com/opencv/opencv/blob/5.x/modules/objdetect/src/face_detect.cpp
export type YuNetOutputs = Record<string, { data: Float32Array }>;
type Box = { x: number; y: number; w: number; h: number; score: number };

function overlap(a: Box, b: Box) {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w), bottom = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return intersection / (a.w * a.h + b.w * b.h - intersection || 1);
}

export function countYuNetFaces(outputs: YuNetOutputs, size = 320, threshold = 0.6) {
  const candidates: Box[] = [];
  for (const stride of [8, 16, 32]) {
    const cls = outputs[`cls_${stride}`]?.data;
    const obj = outputs[`obj_${stride}`]?.data;
    const bbox = outputs[`bbox_${stride}`]?.data;
    const columns = size / stride;
    const anchors = columns * columns;
    if (!cls || !obj || !bbox || cls.length !== anchors || obj.length !== anchors || bbox.length !== anchors * 4)
      throw new Error("YuNet output shape is unsupported.");
    for (let index = 0; index < anchors; index++) {
      const score = Math.sqrt(Math.max(0, Math.min(1, cls[index])) * Math.max(0, Math.min(1, obj[index])));
      if (score < threshold) continue;
      const row = Math.floor(index / columns), column = index % columns;
      const width = Math.exp(bbox[index * 4 + 2]) * stride;
      const height = Math.exp(bbox[index * 4 + 3]) * stride;
      const x = (column + bbox[index * 4]) * stride - width / 2;
      const y = (row + bbox[index * 4 + 1]) * stride - height / 2;
      if (Number.isFinite(x + y + width + height) && width > 0 && height > 0)
        candidates.push({ x, y, w: width, h: height, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const accepted: Box[] = [];
  for (const box of candidates.slice(0, 5000)) {
    if (accepted.every(existing => overlap(existing, box) <= 0.3)) accepted.push(box);
    if (accepted.length >= 2) break;
  }
  return accepted.length;
}

export function webcamTensor(rgba: Uint8ClampedArray, size = 320) {
  if (rgba.length !== size * size * 4) throw new Error("Camera frame size is invalid.");
  const plane = size * size;
  const bgr = new Float32Array(plane * 3);
  let sum = 0, dark = 0;
  for (let index = 0; index < plane; index++) {
    const offset = index * 4;
    const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
    bgr[index] = b; bgr[index + plane] = g; bgr[index + 2 * plane] = r;
    const brightness = (r + g + b) / 3;
    sum += brightness;
    if (brightness < 16) dark++;
  }
  return { data: bgr, obscured: sum / plane < 18 || dark / plane > 0.96 };
}
