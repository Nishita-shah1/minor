import type { Pixels } from "../types";
import { carrierAt, carrierFields, PILOT_DOCUMENT, PILOT_SECRET, type CarrierField } from "./carrier";
import { CAPTURE_SCALES, chipSize, DENSE_FLOORS, DENSE_PERIODS, PILOT_PERIOD, SCALE_WEIGHT, type DenseFloors } from "./profile";
import { luminance } from "./residual";

export type DenseScore = { candidateId: string; score: number };
export type DenseVerdict =
  | { status: "PROBABLE_MATCH"; candidateId: string; scores: DenseScore[]; regions: number; margin: number; medianOther?: number; scalesAgreeing?: number }
  | { status: "INCONCLUSIVE"; scores: DenseScore[]; regions: number; margin: number; medianOther?: number; scalesAgreeing?: number; reason: "WEAK_MARGIN" | "CONFLICTING_PAGES" }
  | { status: "NO_RELIABLE_MARK" };

export type DenseCandidate = { id: string; secret: Uint8Array; documentId: string };

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function scaleEvidence(pixels: Pixels, scale: number): Pixels {
  if (scale === 1) return pixels;
  const width = Math.max(1, Math.round(pixels.width * scale));
  const height = Math.max(1, Math.round(pixels.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(pixels.height - 1, Math.max(0, ((y + 0.5) * pixels.height) / height - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(pixels.height - 1, y0 + 1);
    const dy = sourceY - y0;
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(pixels.width - 1, Math.max(0, ((x + 0.5) * pixels.width) / width - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(pixels.width - 1, x0 + 1);
      const dx = sourceX - x0;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const sample = (pixel: number, row: number) => pixels.data[(row * pixels.width + pixel) * 4 + channel];
        data[index + channel] = Math.round((sample(x0, y0) * (1 - dx) + sample(x1, y0) * dx) * (1 - dy) + (sample(x0, y1) * (1 - dx) + sample(x1, y1) * dx) * dy);
      }
    }
  }
  return { width, height, data };
}

function symbolMeans(values: Float32Array, width: number, height: number, chip: number, originX: number, originY: number) {
  const across = Math.floor((width - originX) / chip);
  const down = Math.floor((height - originY) / chip);
  const means = new Float32Array(Math.max(0, across * down));
  const flat = new Uint8Array(Math.max(0, across * down));
  if (across < 1 || down < 1) return { across: 0, down: 0, means, flat };
  const samples = chip * chip;
  for (let blockY = 0; blockY < down; blockY++) {
    for (let blockX = 0; blockX < across; blockX++) {
      let sum = 0;
      let energy = 0;
      const x0 = originX + blockX * chip;
      const y0 = originY + blockY * chip;
      for (let y = 0; y < chip; y++) {
        const row = (y0 + y) * width + x0;
        for (let x = 0; x < chip; x++) {
          const sample = values[row + x];
          sum += sample;
          energy += sample * sample;
        }
      }
      const mean = sum / samples;
      const index = blockY * across + blockX;
      means[index] = mean;
      flat[index] = energy / samples - mean * mean < 144 ? 1 : 0;
    }
  }
  return { across, down, means, flat };
}

function correlate(means: Float32Array, flat: Uint8Array, across: number, down: number, chip: number, fields: readonly CarrierField[], shiftX: number, shiftY: number) {
  let flatCount = 0;
  for (let index = 0; index < flat.length; index++) flatCount += flat[index];
  const selective = flatCount >= 4 && flatCount * 2 >= flat.length;
  const chosen: number[] = [];
  for (let blockY = 0; blockY < down; blockY++) {
    for (let blockX = 0; blockX < across; blockX++) {
      const index = blockY * across + blockX;
      if (selective && !flat[index]) continue;
      chosen.push(index);
    }
  }
  if (chosen.length < 4) return null;
  let valueMean = 0;
  let chipMean = 0;
  const chips = new Float32Array(chosen.length);
  for (let index = 0; index < chosen.length; index++) {
    const cursor = chosen[index];
    const blockX = cursor % across;
    const blockY = Math.floor(cursor / across);
    valueMean += means[cursor];
    chips[index] = carrierAt(fields, blockX * chip, blockY * chip, shiftX, shiftY);
    chipMean += chips[index];
  }
  valueMean /= chosen.length;
  chipMean /= chosen.length;
  let dot = 0;
  let valueEnergy = 0;
  let chipEnergy = 0;
  for (let index = 0; index < chosen.length; index++) {
    const value = means[chosen[index]] - valueMean;
    const sample = chips[index] - chipMean;
    dot += value * sample;
    valueEnergy += value * value;
    chipEnergy += sample * sample;
  }
  if (valueEnergy < 1e-6 || chipEnergy < 1e-8) return null;
  return dot / Math.sqrt(valueEnergy * chipEnergy);
}

function tileCount(across: number, down: number, period: number, chip: number) {
  const side = period / chip;
  if (side < 1) return 0;
  return Math.floor(across / side) * Math.floor(down / side);
}

type Alignment = { scale: number; originX: number; originY: number; shiftX: number; shiftY: number };

async function lockPilot(evidence: Pixels, scales: readonly number[]): Promise<Alignment | null> {
  const pilot = await carrierFields(PILOT_SECRET, PILOT_DOCUMENT, 1, [PILOT_PERIOD]);
  const chip = chipSize(PILOT_PERIOD);
  const phases = PILOT_PERIOD / chip;
  let best: Alignment & { score: number } | null = null;
  for (const scale of scales) {
    const sized = scaleEvidence(evidence, scale);
    if (Math.min(sized.width, sized.height) < PILOT_PERIOD) continue;
    const gray = luminance(sized);
    for (let originY = 0; originY < chip; originY++) {
      for (let originX = 0; originX < chip; originX++) {
        const grid = symbolMeans(gray, sized.width, sized.height, chip, originX, originY);
        if (grid.across < 2 || grid.down < 2) continue;
        for (let phaseY = 0; phaseY < phases; phaseY++) {
          for (let phaseX = 0; phaseX < phases; phaseX++) {
            const score = correlate(grid.means, grid.flat, grid.across, grid.down, chip, pilot, phaseX * chip, phaseY * chip);
            if (score !== null && (best === null || score > best.score)) best = { scale, originX, originY, shiftX: phaseX * chip, shiftY: phaseY * chip, score };
          }
        }
      }
    }
  }
  return best;
}

type Hypothesis = { scores: DenseScore[]; regions: number; margin: number; leaderId?: string; medianOther?: number; scalesAgreeing?: number };

function summarize(scores: DenseScore[], regions: number, floors: DenseFloors, perScale: Map<string, { period: number; score: number }[]>): Hypothesis {
  const ordered = [...scores].sort((left, right) => right.score - left.score);
  const leader = ordered[0];
  const runner = ordered[1];
  const margin = leader ? leader.score - (runner?.score ?? 0) : 0;
  const others = ordered.slice(1).map((score) => score.score);
  const medianOther = others.length ? median(others) : 0;
  const periods = new Set<number>();
  for (const list of perScale.values()) for (const item of list) periods.add(item.period);
  let scalesAgreeing = 0;
  for (const period of periods) {
    let bestId = "";
    let best = -2;
    for (const [id, list] of perScale) {
      const found = list.find((item) => item.period === period);
      if (found && found.score > best) { best = found.score; bestId = id; }
    }
    if (leader && bestId === leader.candidateId) scalesAgreeing += 1;
  }
  const passes = !!leader && regions >= floors.regions && leader.score >= floors.correlation && margin >= floors.margin;
  return { scores: ordered.slice(0, 5), regions, margin, leaderId: passes ? leader.candidateId : undefined, medianOther, scalesAgreeing };
}

export function judgeScores(scores: DenseScore[], regions: number, floors: DenseFloors = DENSE_FLOORS): DenseVerdict {
  return verdictFromHypotheses([summarize(scores, regions, floors, new Map())]);
}

export function verdictFromHypotheses(hypotheses: Hypothesis[], floors: DenseFloors = DENSE_FLOORS): DenseVerdict {
  const passing = hypotheses.filter((hypothesis) => hypothesis.leaderId);
  const leaders = new Set(passing.map((hypothesis) => hypothesis.leaderId));
  if (leaders.size > 1) {
    const ordered = [...passing].sort((left, right) => right.margin - left.margin);
    const best = ordered[0];
    const rival = ordered.find((hypothesis) => hypothesis.leaderId !== best.leaderId);
    if (!best.leaderId || (rival && best.margin - rival.margin < floors.margin)) {
      return { status: "INCONCLUSIVE", scores: best.scores, regions: best.regions, margin: best.margin, medianOther: best.medianOther ?? 0, scalesAgreeing: best.scalesAgreeing ?? 0, reason: "CONFLICTING_PAGES" };
    }
    return { status: "PROBABLE_MATCH", candidateId: best.leaderId, scores: best.scores, regions: best.regions, margin: best.margin, medianOther: best.medianOther ?? 0, scalesAgreeing: best.scalesAgreeing ?? 0 };
  }
  if (leaders.size === 1) {
    const display = [...passing].sort((left, right) => right.margin - left.margin)[0];
    return { status: "PROBABLE_MATCH", candidateId: display.leaderId!, scores: display.scores, regions: display.regions, margin: display.margin, medianOther: display.medianOther ?? 0, scalesAgreeing: display.scalesAgreeing ?? 0 };
  }
  const usable = hypotheses.filter((hypothesis) => hypothesis.regions > 0 && hypothesis.scores.length > 0);
  if (!usable.length) return { status: "NO_RELIABLE_MARK" };
  const display = [...usable].sort((left, right) => right.margin - left.margin)[0];
  return { status: "INCONCLUSIVE", scores: display.scores, regions: display.regions, margin: display.margin, medianOther: display.medianOther ?? 0, scalesAgreeing: display.scalesAgreeing ?? 0, reason: "WEAK_MARGIN" };
}

export async function rankDense(input: {
  evidence: Pixels;
  candidates: readonly DenseCandidate[];
  pages: readonly number[];
  floors?: DenseFloors;
  captureScales?: readonly number[];
  periods?: readonly number[];
}): Promise<DenseVerdict> {
  if (!input.candidates.length || !input.pages.length) return { status: "NO_RELIABLE_MARK" };
  const floors = input.floors ?? DENSE_FLOORS;
  const scales = input.captureScales ?? CAPTURE_SCALES;
  const periods = input.periods ?? DENSE_PERIODS;
  const alignment = await lockPilot(input.evidence, scales) ?? { scale: 1, originX: 0, originY: 0, shiftX: 0, shiftY: 0 };
  const sized = scaleEvidence(input.evidence, alignment.scale);
  const gray = luminance(sized);
  const active = periods.filter((period) => Math.min(sized.width, sized.height) >= period);
  const hypotheses: Hypothesis[] = [];
  for (const page of input.pages) {
    const prepared = await Promise.all(input.candidates.map(async (candidate) => ({
      id: candidate.id,
      fields: await carrierFields(candidate.secret, candidate.documentId, page, active),
    })));
    const scores: DenseScore[] = [];
    const perScale = new Map<string, { period: number; score: number }[]>();
    let regions = 0;
    for (const candidate of prepared) {
      let accumulated = 0;
      let weight = 0;
      const hits: { period: number; score: number }[] = [];
      for (const period of active) {
        const chip = chipSize(period);
        const field = candidate.fields.filter((item) => item.period === period);
        const grid = symbolMeans(gray, sized.width, sized.height, chip, alignment.originX % chip, alignment.originY % chip);
        if (candidate === prepared[0]) regions = Math.max(regions, tileCount(grid.across, grid.down, period, chip));
        const score = correlate(grid.means, grid.flat, grid.across, grid.down, chip, field, alignment.shiftX, alignment.shiftY);
        if (score === null) continue;
        const scale = SCALE_WEIGHT[period] ?? 1;
        accumulated += scale * score;
        weight += scale;
        hits.push({ period, score });
      }
      if (weight) {
        scores.push({ candidateId: candidate.id, score: accumulated / weight });
        perScale.set(candidate.id, hits);
      }
    }
    hypotheses.push(summarize(scores, regions, floors, perScale));
  }
  return verdictFromHypotheses(hypotheses, floors);
}
