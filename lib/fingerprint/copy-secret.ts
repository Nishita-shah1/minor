import { base64urlToBytes, bytesToBase64url } from "@/lib/crypto/base64url";
import { generateDocumentKey, unwrapDocumentKey, wrapDocumentKey } from "@/lib/crypto/core";
import { deriveIdentifier, identifierHex } from "./identity";
export const EXPERIMENTAL_PROFILE = "trustmark-q-lab-v2";
export type WrappedFingerprint = { ownerWrappedKey: string; recipientWrappedKey: string; profileId: string };
export async function unwrapCopyIdentifier(documentId: string, wrapped: string, privateKey: CryptoKey) {
  const key = await unwrapDocumentKey(base64urlToBytes(wrapped), privateKey, true);
  const secret = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  try { return await deriveIdentifier(documentId, secret); } finally { secret.fill(0); }
}
export async function createCopySecret(documentId: string, owner: CryptoKey, recipient: CryptoKey, used: Set<string>): Promise<WrappedFingerprint> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const key = await generateDocumentKey();
    const secret = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    let identifier: string;
    try { identifier = identifierHex(await deriveIdentifier(documentId, secret)); } finally { secret.fill(0); }
    if (used.has(identifier)) continue;
    used.add(identifier);
    return { profileId: EXPERIMENTAL_PROFILE,
      ownerWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(key, owner))),
      recipientWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(key, recipient))) };
  }
  throw new Error("Could not allocate a unique copy identifier.");
}
