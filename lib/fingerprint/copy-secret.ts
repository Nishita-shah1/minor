import { base64urlToBytes, bytesToBase64url } from "@/lib/crypto/base64url";
import { generateDocumentKey, unwrapDocumentKey, wrapDocumentKey } from "@/lib/crypto/core";
import { deriveIdentifier, identifierHex } from "./identity";
import { ISSUED_PROFILE, TRUSTMARK_PROFILE } from "./profile";
export const EXPERIMENTAL_PROFILE = TRUSTMARK_PROFILE;
export type WrappedFingerprint = { ownerWrappedKey: string; recipientWrappedKey: string; profileId: string };
export async function unwrapCopyMaterial(documentId: string, wrapped: string, privateKey: CryptoKey) {
  const key = await unwrapDocumentKey(base64urlToBytes(wrapped), privateKey, true);
  const secret = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { identifier: await deriveIdentifier(documentId, secret), secret };
}
export async function unwrapCopyIdentifier(documentId: string, wrapped: string, privateKey: CryptoKey) {
  const material = await unwrapCopyMaterial(documentId, wrapped, privateKey);
  try { return material.identifier; } finally { material.secret.fill(0); }
}
export async function createCopySecret(documentId: string, owner: CryptoKey, recipient: CryptoKey, used: Set<string>): Promise<WrappedFingerprint> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const key = await generateDocumentKey();
    const secret = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    let identifier: string;
    try { identifier = identifierHex(await deriveIdentifier(documentId, secret)); } finally { secret.fill(0); }
    if (used.has(identifier)) continue;
    used.add(identifier);
    return { profileId: ISSUED_PROFILE,
      ownerWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(key, owner))),
      recipientWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(key, recipient))) };
  }
  throw new Error("Could not allocate a unique copy identifier.");
}
