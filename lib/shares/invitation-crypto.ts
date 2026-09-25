import { base64urlToBytes, bytesToBase64url } from "@/lib/crypto/base64url";
import { decryptAes, encryptAes, importPublicKey, randomBytes, unwrapDocumentKey, wrapDocumentKey } from "@/lib/crypto/core";
import { EXPERIMENTAL_PROFILE, unwrapCopyIdentifier } from "@/lib/fingerprint/copy-secret";
import { deriveIdentifier, identifierHex } from "@/lib/fingerprint/identity";
import { invitationProof } from "@/lib/shares/invitation-proof";

type OwnerDocument = { documentId: string; ownerWrappedKey: string };
type GrantDocument = { documentId: string; documentKey: string; fingerprintSecret: string };
type Grant = { version: 1; shareId: string; documents: GrantDocument[] };
const encoder = new TextEncoder();
const aad = (shareId: string) => encoder.encode(`EchoLeaks/invitation-grant/v1/${shareId}`);
async function secretKey(secret: Uint8Array) {
  return crypto.subtle.importKey("raw", Uint8Array.from(secret), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function prepareInvitation(input: {
  shareId: string;
  documents: OwnerDocument[];
  existingFingerprints: Array<{ documentId: string; ownerWrappedKey: string }>;
  ownerPrivateKey: CryptoKey;
  ownerPublicKeyJwk: JsonWebKey;
}) {
  const ownerPublic = await importPublicKey(input.ownerPublicKeyJwk);
  const used = new Map<string, Set<string>>();
  for (const fingerprint of input.existingFingerprints) {
    const ids = used.get(fingerprint.documentId) ?? new Set<string>();
    ids.add(identifierHex(await unwrapCopyIdentifier(fingerprint.documentId, fingerprint.ownerWrappedKey, input.ownerPrivateKey)));
    used.set(fingerprint.documentId, ids);
  }
  const grant: Grant = { version: 1, shareId: input.shareId, documents: [] };
  const fingerprints: Array<{ documentId: string; ownerWrappedKey: string; profileId: string }> = [];
  for (const document of input.documents) {
    const key = await unwrapDocumentKey(base64urlToBytes(document.ownerWrappedKey), input.ownerPrivateKey, true);
    const rawDocument = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    let fingerprintSecret: Uint8Array | undefined;
    const ids = used.get(document.documentId) ?? new Set<string>(); used.set(document.documentId, ids);
    for (let attempt = 0; attempt < 16; attempt++) {
      const candidate = randomBytes(32);
      const id = identifierHex(await deriveIdentifier(document.documentId, candidate));
      if (!ids.has(id)) { ids.add(id); fingerprintSecret = candidate; break; }
      candidate.fill(0);
    }
    if (!fingerprintSecret) throw new Error("Could not allocate a distinct fingerprint.");
    const fingerprintKey = await secretKey(fingerprintSecret);
    fingerprints.push({ documentId: document.documentId,
      ownerWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(fingerprintKey, ownerPublic))),
      profileId: EXPERIMENTAL_PROFILE });
    grant.documents.push({ documentId: document.documentId, documentKey: bytesToBase64url(rawDocument), fingerprintSecret: bytesToBase64url(fingerprintSecret) });
    rawDocument.fill(0); fingerprintSecret.fill(0);
  }
  const secret = randomBytes(32);
  const inviteSecret = bytesToBase64url(secret);
  const inviteKey = await secretKey(secret);
  const plaintext = encoder.encode(JSON.stringify(grant));
  const encrypted = await encryptAes(plaintext, inviteKey, aad(input.shareId));
  const proof = await invitationProof(inviteSecret);
  plaintext.fill(0);
  const result = { ciphertext: bytesToBase64url(new Uint8Array(encrypted.ciphertext)), iv: bytesToBase64url(encrypted.iv), proof,
    ownerWrappedSecret: bytesToBase64url(new Uint8Array(await wrapDocumentKey(inviteKey, ownerPublic))), fingerprints,
    inviteSecret };
  secret.fill(0);
  return result;
}

export async function recoverInvitationSecret(ownerWrappedSecret: string, ownerPrivateKey: CryptoKey) {
  const key = await unwrapDocumentKey(base64urlToBytes(ownerWrappedSecret), ownerPrivateKey, true);
  const secret = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  try { return bytesToBase64url(secret); } finally { secret.fill(0); }
}

export async function claimInvitation(input: {
  shareId: string; ciphertext: string; iv: string; inviteSecret: string; recipientPublicKeyJwk: JsonWebKey;
}) {
  const secret = base64urlToBytes(input.inviteSecret);
  if (secret.length !== 32) throw new Error("This invitation code is invalid.");
  const key = await secretKey(secret);
  secret.fill(0);
  let plaintext: Uint8Array;
  try { plaintext = new Uint8Array(await decryptAes(base64urlToBytes(input.ciphertext), key, base64urlToBytes(input.iv), aad(input.shareId))); }
  catch { throw new Error("The invitation code does not match this share."); }
  const proof = await invitationProof(input.inviteSecret);
  let grant: Grant;
  try { grant = JSON.parse(new TextDecoder().decode(plaintext)) as Grant; }
  catch { throw new Error("The invitation grant is damaged."); }
  finally { plaintext.fill(0); }
  if (grant.version !== 1 || grant.shareId !== input.shareId || !Array.isArray(grant.documents)) throw new Error("The invitation grant is incompatible.");
  const recipient = await importPublicKey(input.recipientPublicKeyJwk);
  const envelopes = [];
  for (const document of grant.documents) {
    const rawDocument = base64urlToBytes(document.documentKey);
    const rawFingerprint = base64urlToBytes(document.fingerprintSecret);
    if (rawDocument.length !== 32 || rawFingerprint.length !== 32) throw new Error("The invitation grant is damaged.");
    const documentKey = await secretKey(rawDocument), fingerprintKey = await secretKey(rawFingerprint);
    envelopes.push({ documentId: document.documentId,
      wrappedFileKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(documentKey, recipient))),
      recipientWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(fingerprintKey, recipient))) });
    rawDocument.fill(0); rawFingerprint.fill(0);
  }
  return { proof, envelopes };
}
