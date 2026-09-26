export const DENSE_PERIODS = [16, 32, 64, 128] as const;
export const DENSE_PHASES = ["0", "half"] as const;
export const CAPTURE_SCALES = [0.75, 1, 1.25] as const;
export const PILOT_PERIOD = 32;
export const SCALE_WEIGHT: Record<number, number> = { 16: 0.5, 32: 1, 64: 0.75, 128: 0.75 };
export const FLAT_STRENGTH = 1;
export const MIN_STRENGTH = FLAT_STRENGTH;
export const STRENGTH_CAP = 4;
export const IDENTITY_MIX = 0.5;
export const PILOT_MIX = 0.5;
export const VARIANCE_FLOOR = 8;
export const PAGE_SEARCH_CAP = 32;
export const DENSE_FLOORS = { correlation: 0.6, margin: 0.2, regions: 8 } as const;

export type DensePhase = (typeof DENSE_PHASES)[number];
export type DenseFloors = { correlation: number; margin: number; regions: number };

export function chipSize(period: number) {
  return period / 4;
}

/** Total code-value amplitude. Flat paper stays at ±1. ±8 is not the default. */
export function steppedAmplitude(deviation: number, cap = STRENGTH_CAP) {
  const step = deviation < VARIANCE_FLOOR ? FLAT_STRENGTH : deviation < 16 ? 3 : deviation < 24 ? 5 : 6;
  return Math.min(cap, step);
}
