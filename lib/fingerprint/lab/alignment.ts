import type { Pixels } from "../types";
import { validatePixels } from "../trustmark/pixels";

export type Point = { x: number; y: number };
export type Correspondence = { original: readonly Point[]; evidence: readonly Point[] };
export class AlignmentError extends Error {
  constructor(public readonly code: "INVALID_ALIGNMENT" | "UNSUPPORTED_COVERAGE") { super(code); }
}

// Points are ordered around each quadrilateral, in corresponding order. Coordinates
// describe pixel edges: (0,0) through (width,height), not CSS display coordinates.
function checkQuad(points: readonly Point[], width: number, height: number) {
  if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height)) throw new AlignmentError("INVALID_ALIGNMENT");
  const turns = points.map((p, i) => {
    const q = points[(i + 1) % 4], r = points[(i + 2) % 4];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  if (!turns.every(t => t > 1e-6) && !turns.every(t => t < -1e-6)) throw new AlignmentError("INVALID_ALIGNMENT");
}

function contains(points: readonly Point[], x: number, y: number) {
  const cross = points.map((p, i) => {
    const q = points[(i + 1) % 4];
    return (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
  });
  return cross.every(c => c >= -1e-7) || cross.every(c => c <= 1e-7);
}

// Solve the 8 homography coefficients with partial pivoting in normalized space.
function homography(from: readonly Point[], to: readonly Point[]) {
  const rows: number[][] = [];
  from.forEach(({ x, y }, i) => {
    const { x: u, y: v } = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-10) throw new AlignmentError("INVALID_ALIGNMENT");
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let k = col; k <= 8; k++) rows[col][k] /= divisor;
    for (let row = 0; row < 8; row++) if (row !== col) {
      const factor = rows[row][col];
      for (let k = col; k <= 8; k++) rows[row][k] -= factor * rows[col][k];
    }
  }
  const h = rows.map(r => r[8]);
  const denominators = from.map(p => h[6] * p.x + h[7] * p.y + 1);
  if (!h.every(Number.isFinite) || (!denominators.every(d => d > 1e-8) && !denominators.every(d => d < -1e-8))) throw new AlignmentError("INVALID_ALIGNMENT");
  return h;
}

export function reconstruct(original: Pixels, evidence: Pixels, points: Correspondence): { pixels: Pixels; coverage: number } {
  validatePixels(original);
  if (!Number.isInteger(evidence.width) || !Number.isInteger(evidence.height) || evidence.width < 1 || evidence.height < 1 || evidence.width > 4096 || evidence.height > 4096 || evidence.width * evidence.height > 4_194_304 || evidence.data.length !== evidence.width * evidence.height * 4) throw new AlignmentError("INVALID_ALIGNMENT");
  checkQuad(points.original, original.width, original.height);
  checkQuad(points.evidence, evidence.width, evidence.height);
  const normalized = (p: readonly Point[], w: number, h: number) => p.map(q => ({ x: q.x / w, y: q.y / h }));
  const matrix = homography(normalized(points.original, original.width, original.height), normalized(points.evidence, evidence.width, evidence.height));
  const data = original.data.slice();
  let observed = 0;
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
    if (!contains(points.original, x + 0.5, y + 0.5)) continue;
    const nx = (x + 0.5) / original.width, ny = (y + 0.5) / original.height;
    const d = matrix[6] * nx + matrix[7] * ny + 1;
    const ex = (matrix[0] * nx + matrix[1] * ny + matrix[2]) / d * evidence.width;
    const ey = (matrix[3] * nx + matrix[4] * ny + matrix[5]) / d * evidence.height;
    if (!Number.isFinite(ex) || !Number.isFinite(ey) || ex < 0 || ey < 0 || ex > evidence.width || ey > evidence.height || !contains(points.evidence, ex, ey)) continue;
    const sx = Math.max(0, Math.min(evidence.width - 1, ex - 0.5));
    const sy = Math.max(0, Math.min(evidence.height - 1, ey - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, evidence.width - 1), y1 = Math.min(y0 + 1, evidence.height - 1);
    const dx = sx - x0, dy = sy - y0;
    const indices = [y0 * evidence.width + x0, y0 * evidence.width + x1, y1 * evidence.width + x0, y1 * evidence.width + x1];
    // Transparent fill carries no observed evidence.
    if (indices.some(i => evidence.data[i * 4 + 3] !== 255)) continue;
    for (let c = 0; c < 3; c++) {
      const values = indices.map(i => evidence.data[i * 4 + c]);
      data[(y * original.width + x) * 4 + c] = Math.round((values[0] * (1 - dx) + values[1] * dx) * (1 - dy) + (values[2] * (1 - dx) + values[3] * dx) * dy);
    }
    data[(y * original.width + x) * 4 + 3] = 255;
    observed++;
  }
  const coverage = observed / (original.width * original.height);
  if (coverage < 0.5) throw new AlignmentError("UNSUPPORTED_COVERAGE");
  return { pixels: { width: original.width, height: original.height, data }, coverage };
}

export function corners(width: number, height: number): Point[] {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}
