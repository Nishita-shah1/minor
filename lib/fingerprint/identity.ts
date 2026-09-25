export async function deriveIdentifier(documentId: string, secret: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId) || secret.length !== 32) {
    throw new Error("Expected a document UUID and a 32-byte fingerprint secret");
  }
  const label = new TextEncoder().encode("EchoLeaks/TrustMark/copy-id/v1");
  const uuid = documentId.replaceAll("-", "");
  const input = new Uint8Array(label.length + 1 + 16 + 32);
  input.set(label);
  for (let i = 0; i < 16; i++) input[label.length + 1 + i] = parseInt(uuid.slice(i * 2, i * 2 + 2), 16);
  input.set(secret, label.length + 17);
  try { return new Uint8Array(await crypto.subtle.digest("SHA-256", input)).slice(0, 5); }
  finally { input.fill(0); }
}

export function identifierHex(identifier: Uint8Array): string {
  if (identifier.length !== 5) throw new Error("Expected a five-byte copy identifier");
  return Array.from(identifier, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type MatchResult = { status: "CANDIDATE_MATCH"; candidateId: string } | { status: "UNKNOWN_MARK" | "INCONCLUSIVE" };

export function resolveIdentifier(identifier: Uint8Array, candidates: readonly { id: string; identifier: Uint8Array }[]): MatchResult {
  const token = identifierHex(identifier);
  const matches = candidates.filter((candidate) => identifierHex(candidate.identifier) === token);
  if (matches.length > 1) return { status: "INCONCLUSIVE" };
  return matches.length === 1 ? { status: "CANDIDATE_MATCH", candidateId: matches[0].id } : { status: "UNKNOWN_MARK" };
}
