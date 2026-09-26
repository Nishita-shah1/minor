import { expect, it } from "vitest";
import { carrierAt, carrierFields } from "./carrier";
import { embedDense } from "./embed";
import { DENSE_FLOORS, MIN_STRENGTH, STRENGTH_CAP } from "./profile";
import { judgeScores, rankDense, verdictFromHypotheses } from "./rank";
import { luminance, normalizedResidual } from "./residual";
import type { Pixels } from "../types";
import { ISSUED_PROFILE, parseIssuedProfile, TRUSTMARK_PROFILE } from "../profile";

const documentId = "11111111-1111-4111-8111-111111111111";

function secret(fill: number) {
  return new Uint8Array(32).fill(fill);
}

function paint(width: number, height: number, ink: (x: number, y: number) => number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = ink(x, y);
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function ruledPage(width: number, height: number, gap: number, paper: number): Pixels {
  return paint(width, height, (x, y) => (y % gap < 2 && x % 5 !== 0 ? 30 : paper));
}

function blockPage(width: number, height: number): Pixels {
  return paint(width, height, (x, y) => ((Math.floor(x / 17) + Math.floor(y / 13)) % 2 === 0 ? 214 : 168));
}

function textured(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const value = 80 + ((x * 13 + y * 7) % 90);
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function crop(pixels: Pixels, x: number, y: number, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    data.set(pixels.data.subarray(((y + row) * pixels.width + x) * 4, ((y + row) * pixels.width + x + width) * 4), row * width * 4);
  }
  return { width, height, data };
}

it("repeats the same carrier one period away and changes with the secret", async () => {
  const fields = await carrierFields(secret(7), documentId, 1, [32]);
  expect(carrierAt(fields, 3, 5)).toBeCloseTo(carrierAt(fields, 35, 37));
  expect(carrierAt(fields, 3, 5)).not.toBeCloseTo(carrierAt(await carrierFields(secret(8), documentId, 1, [32]), 3, 5));
});

it("keeps a flat page within the minimum strength and limits textured changes to the strength cap", async () => {
  const flat: Pixels = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
  for (let i = 0; i < flat.data.length; i += 4) { flat.data[i] = flat.data[i + 1] = flat.data[i + 2] = 140; flat.data[i + 3] = 255; }
  const unmarked = await embedDense(flat, secret(4), documentId, 1);
  for (let i = 0; i < flat.data.length; i += 4) {
    expect(Math.abs(unmarked.pixels.data[i] - flat.data[i])).toBeLessThanOrEqual(MIN_STRENGTH);
    expect(unmarked.pixels.data[i + 3]).toBe(255);
  }
  const source = textured(96, 96);
  const marked = await embedDense(source, secret(4), documentId, 1);
  let changed = false;
  for (let i = 0; i < source.data.length; i += 4) {
    expect(Math.abs(marked.pixels.data[i] - source.data[i])).toBeLessThanOrEqual(STRENGTH_CAP);
    expect(Math.abs(marked.pixels.data[i + 1] - source.data[i + 1])).toBeLessThanOrEqual(STRENGTH_CAP);
    expect(Math.abs(marked.pixels.data[i + 2] - source.data[i + 2])).toBeLessThanOrEqual(STRENGTH_CAP);
    expect(marked.pixels.data[i + 3]).toBe(255);
    if (marked.pixels.data[i] !== source.data[i]) changed = true;
  }
  expect(changed).toBe(true);
});

it("high-passes a constant field to silence instead of correlating raw luminance", () => {
  const pixels = textured(32, 32);
  pixels.data.fill(180);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
  const residual = normalizedResidual(pixels, 32);
  expect(Math.max(...residual.values.map((value) => Math.abs(value)))).toBeLessThan(1e-4);
  expect(luminance(pixels)[0]).toBeCloseTo(180);
});

it("names a copy only when the margin and region floors both hold", () => {
  expect(judgeScores([{ candidateId: "bob", score: 0.82 }, { candidateId: "alice", score: 0.34 }, { candidateId: "charlie", score: 0.29 }], 11)).toMatchObject({ status: "PROBABLE_MATCH", candidateId: "bob" });
  const close = judgeScores([{ candidateId: "bob", score: 0.55 }, { candidateId: "alice", score: 0.51 }], 11);
  expect(close.status).toBe("INCONCLUSIVE");
  expect(close).not.toHaveProperty("candidateId");
  expect(judgeScores([{ candidateId: "bob", score: 0.9 }], 4).status).toBe("INCONCLUSIVE");
  expect(judgeScores([], 0).status).toBe("NO_RELIABLE_MARK");
  const crowd = Array.from({ length: 200 }, (_, index) => ({ candidateId: `n${index}`, score: 0.05 + (index % 7) * 0.01 }));
  crowd[0] = { candidateId: "bob", score: 0.2 };
  expect(judgeScores(crowd, DENSE_FLOORS.regions).status).toBe("INCONCLUSIVE");
  const bob = judgeScores([{ candidateId: "bob", score: 0.9 }, { candidateId: "alice", score: 0.1 }], 10);
  const alice = judgeScores([{ candidateId: "alice", score: 0.9 }, { candidateId: "bob", score: 0.1 }], 10);
  if (bob.status !== "PROBABLE_MATCH" || alice.status !== "PROBABLE_MATCH") throw new Error("expected both page hypotheses to pass");
  expect(verdictFromHypotheses([
    { scores: bob.scores, regions: bob.regions, margin: bob.margin, leaderId: bob.candidateId },
    { scores: alice.scores, regions: alice.regions, margin: alice.margin, leaderId: alice.candidateId },
  ]).status).toBe("INCONCLUSIVE");
});

it("recovers a flat held-out crop at the true alignment", async () => {
  const owner = secret(21);
  const document = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const source = paint(160, 128, () => 180);
  const marked = await embedDense(source, owner, document, 1, [32]);
  const ranked = await rankDense({
    evidence: crop(marked.pixels, 13, 7, 96, 96),
    pages: [1],
    captureScales: [1],
    periods: [32],
    candidates: [
      { id: "owner", secret: owner, documentId: document },
      { id: "other", secret: secret(4), documentId: document },
    ],
  });
  expect(ranked.status === "NO_RELIABLE_MARK" ? undefined : ranked.scores[0]?.candidateId).toBe("owner");
  if (ranked.status !== "NO_RELIABLE_MARK") expect(ranked.scores[0]?.score).toBeGreaterThan(0.4);
});

it("ranks held-out crops without naming an unmarked page or a wrong document", async () => {
  const heldOut = [
    { id: "held-a", documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fill: 21, kind: "ruled" as const, originX: 13, originY: 7 },
    { id: "held-b", documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fill: 44, kind: "blocks" as const, originX: 5, originY: 11 },
  ];
  for (const sample of heldOut) {
    const owner = secret(sample.fill);
    const source = sample.kind === "ruled" ? ruledPage(220, 180, 22, 236) : blockPage(220, 180);
    const marked = await embedDense(source, owner, sample.documentId, 1);
    const candidates = [
      { id: "owner", secret: owner, documentId: sample.documentId },
      { id: "other", secret: secret(sample.fill + 3), documentId: sample.documentId },
      { id: "third", secret: secret(sample.fill + 9), documentId: sample.documentId },
    ];
    const options = { candidates, pages: [1], captureScales: [1] as const };
    const wide = await rankDense({ evidence: crop(marked.pixels, sample.originX, sample.originY, 96, 96), ...options });
    expect(wide.status === "NO_RELIABLE_MARK" ? undefined : wide.scores[0]?.candidateId).toBe("owner");
    if (wide.status !== "NO_RELIABLE_MARK" && wide.scores[0]?.score !== undefined && wide.scores[0].score < DENSE_FLOORS.correlation) expect(wide.status).toBe("INCONCLUSIVE");
    if (wide.status === "PROBABLE_MATCH") expect(wide.candidateId).toBe("owner");
    const mid = await rankDense({ evidence: crop(marked.pixels, sample.originX + 3, sample.originY + 2, 64, 64), ...options });
    if (mid.status === "PROBABLE_MATCH") expect(mid.candidateId).toBe("owner");
    const tiny = await rankDense({ evidence: crop(marked.pixels, sample.originX + 1, sample.originY + 4, 32, 32), ...options });
    if (tiny.status === "PROBABLE_MATCH") expect(tiny.candidateId).toBe("owner");
    expect((await rankDense({ evidence: crop(source, sample.originX, sample.originY, 96, 96), ...options })).status).not.toBe("PROBABLE_MATCH");
    const wrong = await rankDense({
      evidence: crop(marked.pixels, sample.originX, sample.originY, 96, 96),
      pages: [1],
      captureScales: [1],
      candidates: candidates.map((candidate) => ({ ...candidate, documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })),
    });
    expect(wrong.status).not.toBe("PROBABLE_MATCH");
  }
});

it("accepts the combined profile and leaves legacy TrustMark rows without a dense version", () => {
  expect(parseIssuedProfile(ISSUED_PROFILE)).toEqual({ trustmarkProfile: TRUSTMARK_PROFILE, denseProfile: "densecrop-v1" });
  expect(parseIssuedProfile(TRUSTMARK_PROFILE)?.denseProfile).toBeNull();
  expect(parseIssuedProfile("densecrop-v2")).toBeNull();
});
