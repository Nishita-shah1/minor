/// <reference lib="webworker" />

import {
  generateUserKeyPair,
  importPrivateKey,
  publicKeyFingerprint,
} from "@/lib/crypto/core";
import { decryptPrivateKeyBackup, encryptPrivateKeyBackup } from "@/lib/crypto/key-vault-core";
import type { KeyBundleResponse } from "@/lib/crypto/types";

type SetupRequest = { id: string; operation: "SETUP"; clerkUserId: string; passphrase: string };
type RecoverRequest = {
  id: string;
  operation: "RECOVER";
  clerkUserId: string;
  passphrase: string;
  bundle: KeyBundleResponse;
};

self.onmessage = async (event: MessageEvent<SetupRequest | RecoverRequest>) => {
  const request = event.data;
  try {
    if (request.operation === "SETUP") {
      const pair = await generateUserKeyPair();
      const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
      const fingerprint = await publicKeyFingerprint(publicKeyJwk);
      const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
      const backup = await encryptPrivateKeyBackup(privateBytes, request.passphrase, request.clerkUserId);
      const privateKey = await importPrivateKey(privateBytes, false);
      privateBytes.fill(0);
      self.postMessage({
        id: request.id,
        ok: true,
        result: {
          privateKey,
          bundle: {
            publicKeyJwk,
            publicKeyFingerprint: fingerprint,
            ...backup,
            keyVersion: 1,
          },
        },
      });
      return;
    }

    const decrypted = new Uint8Array(await decryptPrivateKeyBackup(
      request.bundle,
      request.passphrase,
      request.clerkUserId,
    ));
    const privateKey = await importPrivateKey(decrypted, false);
    decrypted.fill(0);
    self.postMessage({ id: request.id, ok: true, result: { privateKey } });
  } catch {
    self.postMessage({ id: request.id, ok: false, error: "The recovery passphrase is incorrect or the backup is damaged." });
  }
};

export {};
