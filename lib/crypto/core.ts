import { AES_GCM_IV_BYTES, AES_GCM_TAG_BITS, RSA_MODULUS_BITS } from "./constants";

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function generateDocumentKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function generateUserKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: RSA_MODULUS_BITS,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"],
  );
}

export async function encryptAes(data: BufferSource, key: CryptoKey, additionalData: BufferSource) {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: AES_GCM_TAG_BITS },
    key,
    data,
  );
  return { ciphertext, iv };
}

export async function decryptAes(
  ciphertext: BufferSource,
  key: CryptoKey,
  iv: BufferSource,
  additionalData: BufferSource,
) {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: AES_GCM_TAG_BITS },
    key,
    ciphertext,
  );
}

export async function importPublicKey(jwk: JsonWebKey) {
  return crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["wrapKey"]);
}

export async function importPrivateKey(pkcs8: BufferSource, extractable = false) {
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    extractable,
    ["unwrapKey"],
  );
}

export async function wrapDocumentKey(documentKey: CryptoKey, publicKey: CryptoKey) {
  return crypto.subtle.wrapKey("raw", documentKey, publicKey, { name: "RSA-OAEP" });
}

export async function unwrapDocumentKey(wrapped: BufferSource, privateKey: CryptoKey, extractable = false) {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export async function publicKeyFingerprint(jwk: JsonWebKey) {
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
