import type { DenseScore, DenseVerdict } from "../dense/rank";
import { identifierHex, resolveIdentifier } from "../identity";
import type { DecodeResult, Pixels } from "../types";
import { frameEvidence, validatePixels } from "../trustmark/pixels";
import { AlignmentError, reconstruct, type Correspondence } from "./alignment";

export type Candidate = { id: string; identifier: Uint8Array };
export type Investigation = {
  status: "CANDIDATE_MATCH" | "UNKNOWN_MARK" | "NO_RELIABLE_MARK" | "INCONCLUSIVE" | "PROBABLE_MATCH";
  candidateId?: string;
  identifier?: string;
  reason?: string;
  coverage: number | null;
  attempts: number;
  scores?: DenseScore[];
  regions?: number;
  margin?: number;
  medianOther?: number;
  scalesAgreeing?: number;
};

// Experimental local procedure. The decoder receives pixels only, never expected
// identities, candidate records, filenames, or fixture labels.
export async function investigate(input: {
  original: Pixels; evidence: Pixels; correspondence?: Correspondence;
  decode: (pixels: Pixels) => Promise<DecodeResult>;
  candidates: readonly Candidate[];
  rankDense?: (pixels: Pixels) => Promise<DenseVerdict>;
}): Promise<Investigation> {
  let attempts = 0, coverage: number | null = null;
  try {
    if (input.original !== input.evidence) validatePixels(input.original);
    // Validate supplied geometry/coverage before considering a direct result.
    const aligned = input.correspondence ? reconstruct(input.original, input.evidence, input.correspondence) : null;
    coverage = aligned?.coverage ?? null;
    const results: DecodeResult[] = [];
    const framed = frameEvidence(input.evidence);
    attempts++;
    results.push(await input.decode(framed));
    if (aligned) { attempts++; results.push(await input.decode(aligned.pixels)); }
    const identifiers = results.flatMap(result => result.status === "VALID_IDENTIFIER" ? [result.identifier] : []);
    const tokens = new Set(identifiers.map(identifierHex));
    if (tokens.size > 1) return { status: "INCONCLUSIVE", reason: "CONFLICTING_IDENTIFIERS", coverage, attempts };
    if (identifiers.length === 0) {
      if (input.rankDense) {
        attempts += 1;
        const ranked = await input.rankDense(input.evidence);
        if (ranked.status === "PROBABLE_MATCH") return { status: "PROBABLE_MATCH", candidateId: ranked.candidateId, scores: ranked.scores, regions: ranked.regions, margin: ranked.margin, medianOther: ranked.medianOther, scalesAgreeing: ranked.scalesAgreeing, coverage, attempts };
        if (ranked.status === "INCONCLUSIVE") return { status: "INCONCLUSIVE", reason: ranked.reason, scores: ranked.scores, regions: ranked.regions, margin: ranked.margin, medianOther: ranked.medianOther, scalesAgreeing: ranked.scalesAgreeing, coverage, attempts };
      }
      return { status: attempts ? "NO_RELIABLE_MARK" : "INCONCLUSIVE", reason: attempts ? undefined : "UNSUPPORTED_EVIDENCE", coverage, attempts };
    }
    return { ...resolveIdentifier(identifiers[0], input.candidates), identifier: identifierHex(identifiers[0]), coverage, attempts };
  } catch (error) {
    return { status: "INCONCLUSIVE", reason: error instanceof AlignmentError ? error.code : "PROCESSING_FAILED", coverage, attempts };
  }
}
