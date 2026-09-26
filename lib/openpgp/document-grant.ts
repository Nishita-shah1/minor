import { fileAad, metadataAad } from "@/lib/crypto/aad";
import { base64urlToBytes, bytesToBase64url } from "@/lib/crypto/base64url";
import { decryptAes, unwrapDocumentKey } from "@/lib/crypto/core";
import type { EncryptedDocumentDescriptor, FileMetadata } from "@/lib/crypto/types";
import { deriveIdentifier } from "@/lib/fingerprint/identity";

export type OpenPgpGrant = {
  version: 1;
  shareId: string;
  documents: Array<{ documentId: string; documentKey: string; fingerprintSecret: string | null }>;
};

export async function buildOpenPgpGrant(input: {
  shareId: string;
  privateKey: CryptoKey;
  documents: Array<{ documentId: string; ownerWrappedKey: string }>;
  fingerprints: Array<{ documentId: string; ownerWrappedKey: string }>;
}): Promise<OpenPgpGrant> {
  const documents = [];
  for (const document of input.documents) {
    const key = await unwrapDocumentKey(base64urlToBytes(document.ownerWrappedKey), input.privateKey, true);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const fingerprint = input.fingerprints.find((item) => item.documentId === document.documentId);
    let fingerprintSecret: string | null = null;
    if (fingerprint) {
      const fingerprintKey = await unwrapDocumentKey(base64urlToBytes(fingerprint.ownerWrappedKey), input.privateKey, true);
      const secret = new Uint8Array(await crypto.subtle.exportKey("raw", fingerprintKey));
      fingerprintSecret = bytesToBase64url(secret);
      secret.fill(0);
    }
    documents.push({ documentId: document.documentId, documentKey: bytesToBase64url(raw), fingerprintSecret });
    raw.fill(0);
  }
  return { version: 1, shareId: input.shareId, documents };
}

export async function encryptOpenPgpGrant(armoredPublicKey: string, grant: OpenPgpGrant) {
  const openpgp = await import("openpgp");
  const encryptionKeys = await openpgp.readKey({ armoredKey: armoredPublicKey });
  if (encryptionKeys.isPrivate()) throw new Error("Upload a public key, not a private key.");
  const message = await openpgp.createMessage({ text: JSON.stringify(grant) });
  const encrypted = await openpgp.encrypt({ message, encryptionKeys, format: "armored" });
  if (typeof encrypted !== "string" || encrypted.includes(grant.shareId)) throw new Error("Could not encrypt this share to the public key.");
  return encrypted;
}

export async function readOpenPgpKeyPair(armoredPrivateKey: string, passphrase: string) {
  const openpgp = await import("openpgp");
  const trimmed = armoredPrivateKey.trim();
  if (!trimmed.includes("BEGIN PGP PRIVATE KEY BLOCK")) throw new Error("Type the OpenPGP private key for this share.");
  let privateKey = await openpgp.readPrivateKey({ armoredKey: trimmed });
  const fingerprint = privateKey.getFingerprint().toLowerCase();
  if (!privateKey.isDecrypted()) {
    if (!passphrase) throw new Error("Enter the passphrase for this private key.");
    privateKey = await openpgp.decryptKey({ privateKey, passphrase });
  }
  return { fingerprint, armoredPublicKey: privateKey.toPublic().armor(), privateKey };
}

export async function decryptOpenPgpGrant(input: {
  armoredPrivateKey: string;
  passphrase: string;
  armoredMessage: string;
  shareId: string;
  expectedFingerprint: string;
}): Promise<OpenPgpGrant> {
  const openpgp = await import("openpgp");
  const pair = await readOpenPgpKeyPair(input.armoredPrivateKey, input.passphrase);
  if (pair.fingerprint !== input.expectedFingerprint.toLowerCase()) {
    throw new Error("This private key does not match the public key for this share.");
  }
  const privateKey = pair.privateKey;
  const message = await openpgp.readMessage({ armoredMessage: input.armoredMessage });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  let grant: OpenPgpGrant;
  try { grant = JSON.parse(text) as OpenPgpGrant; }
  catch { throw new Error("This private key did not open this share."); }
  if (grant.version !== 1 || grant.shareId !== input.shareId || !Array.isArray(grant.documents)) {
    throw new Error("This private key did not open this share.");
  }
  return grant;
}

async function grantKey(documentKey: string) {
  const raw = base64urlToBytes(documentKey);
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  raw.fill(0);
  return key;
}

export async function decryptGrantMetadata(grant: OpenPgpGrant, documents: EncryptedDocumentDescriptor[]) {
  const files = [];
  for (const document of documents) {
    const entry = grant.documents.find((item) => item.documentId === document.documentId);
    if (document.status === "DELETED" || !entry || !document.encryptedMetadata || !document.metadataIv) {
      files.push({ documentId: document.documentId, status: "DELETED" as const, metadata: null });
      continue;
    }
    const bytes = new Uint8Array(await decryptAes(
      base64urlToBytes(document.encryptedMetadata),
      await grantKey(entry.documentKey),
      base64urlToBytes(document.metadataIv),
      metadataAad(document.documentId),
    ));
    const metadata = JSON.parse(new TextDecoder().decode(bytes)) as FileMetadata;
    bytes.fill(0);
    files.push({ documentId: document.documentId, status: "READY" as const, metadata });
  }
  return files;
}

export async function decryptGrantDownload(grant: OpenPgpGrant, documentId: string, fileIv: string, ciphertext: ArrayBuffer) {
  const entry = grant.documents.find((item) => item.documentId === documentId);
  if (!entry) throw new Error("This private key does not contain that file.");
  const file = await decryptAes(ciphertext, await grantKey(entry.documentKey), base64urlToBytes(fileIv), fileAad(documentId));
  let fingerprintId: Uint8Array | undefined;
  if (entry.fingerprintSecret) {
    const secret = base64urlToBytes(entry.fingerprintSecret);
    try { fingerprintId = await deriveIdentifier(documentId, secret); }
    finally { secret.fill(0); }
  }
  return { file, fingerprintId };
}
