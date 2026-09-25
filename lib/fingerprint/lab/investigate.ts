import { identifierHex, resolveIdentifier } from "../identity";
import type { DecodeResult, Pixels } from "../types";
import { validatePixels } from "../trustmark/pixels";
import { AlignmentError, reconstruct, type Correspondence } from "./alignment";

export type Candidate = { id: string; identifier: Uint8Array };
export type Investigation = {
  status: "CANDIDATE_MATCH" | "UNKNOWN_MARK" | "NO_RELIABLE_MARK" | "INCONCLUSIVE";
  candidateId?: string;
  reason?: string;
  coverage: number | null;
  attempts: number;
};

// Experimental local procedure. The decoder receives pixels only, never expected
// identities, candidate records, filenames, or fixture labels.
export async function investigate(input: {
  original: Pixels; evidence: Pixels; correspondence?: Correspondence;
  decode: (pixels: Pixels) => Promise<DecodeResult>;
  candidates: readonly Candidate[];
}): Promise<Investigation> {
  let attempts = 0, coverage: number | null = null;
  try {
    validatePixels(input.original);
    // Validate supplied geometry/coverage before considering a direct result.
    const aligned = input.correspondence ? reconstruct(input.original, input.evidence, input.correspondence) : null;
    coverage = aligned?.coverage ?? null;
    const results: DecodeResult[] = [];
    let directSupported = true;
    try { validatePixels(input.evidence); } catch { directSupported = false; }
    if (directSupported) { attempts++; results.push(await input.decode(input.evidence)); }
    if (aligned) { attempts++; results.push(await input.decode(aligned.pixels)); }
    const identifiers = results.flatMap(result => result.status === "VALID_IDENTIFIER" ? [result.identifier] : []);
    const tokens = new Set(identifiers.map(identifierHex));
    if (tokens.size > 1) return { status: "INCONCLUSIVE", reason: "CONFLICTING_IDENTIFIERS", coverage, attempts };
    if (identifiers.length === 0) return { status: attempts ? "NO_RELIABLE_MARK" : "INCONCLUSIVE", reason: attempts ? undefined : "UNSUPPORTED_EVIDENCE", coverage, attempts };
    return { ...resolveIdentifier(identifiers[0], input.candidates), coverage, attempts };
  } catch (error) {
    return { status: "INCONCLUSIVE", reason: error instanceof AlignmentError ? error.code : "PROCESSING_FAILED", coverage, attempts };
  }
}
