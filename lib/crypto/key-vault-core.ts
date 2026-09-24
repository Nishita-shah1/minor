import sodium from "libsodium-wrappers-sumo";
import { vaultAad } from "./aad";
import { base64urlToBytes, bytesToBase64url } from "./base64url";
import { KDF_PARAMETERS } from "./constants";
import { decryptAes, encryptAes, randomBytes } from "./core";
import type { KeyBundleResponse } from "./types";

type KdfParameters = { memoryBytes: number; operations: number; outputBytes: number };

export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  parameters: KdfParameters = KDF_PARAMETERS,
) {
  await sodium.ready;
  const sodiumBytes = sodium.crypto_pwhash(
    parameters.outputBytes,
    passphrase,
    salt,
    parameters.operations,
    parameters.memoryBytes,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const bytes = Uint8Array.from(sodiumBytes);
  sodiumBytes.fill(0);
  try {
    return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } finally {
    bytes.fill(0);
  }
}

export async function encryptPrivateKeyBackup(
  privateKeyBytes: Uint8Array<ArrayBuffer>,
  passphrase: string,
  clerkUserId: string,
) {
  const salt = randomBytes(16);
  const key = await deriveVaultKey(passphrase, salt);
  const encrypted = await encryptAes(privateKeyBytes, key, vaultAad(clerkUserId));
  return {
    encryptedPrivateKey: bytesToBase64url(new Uint8Array(encrypted.ciphertext)),
    privateKeyIv: bytesToBase64url(encrypted.iv),
    kdfSalt: bytesToBase64url(salt),
    kdfParameters: KDF_PARAMETERS,
  };
}

export async function decryptPrivateKeyBackup(
  bundle: Pick<KeyBundleResponse, "encryptedPrivateKey" | "privateKeyIv" | "kdfSalt" | "kdfParameters">,
  passphrase: string,
  clerkUserId: string,
) {
  const key = await deriveVaultKey(passphrase, base64urlToBytes(bundle.kdfSalt), bundle.kdfParameters);
  return decryptAes(
    base64urlToBytes(bundle.encryptedPrivateKey),
    key,
    base64urlToBytes(bundle.privateKeyIv),
    vaultAad(clerkUserId),
  );
}
