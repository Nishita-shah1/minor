/// <reference lib="webworker" />

import { fileAad, metadataAad } from "@/lib/crypto/aad";
import { base64urlToBytes, bytesToBase64url } from "@/lib/crypto/base64url";
import {
  decryptAes,
  encryptAes,
  generateDocumentKey,
  importPublicKey,
  unwrapDocumentKey,
  wrapDocumentKey,
} from "@/lib/crypto/core";
import type { DocumentDownloadAccess, EncryptedDocumentDescriptor, FileMetadata, PreparedRecipient } from "@/lib/crypto/types";

type EncryptRequest = {
  id: string;
  operation: "ENCRYPT_UPLOAD";
  file: File;
  documentId: string;
  uploadUrl: string;
  ownerPublicKeyJwk: JsonWebKey;
  ownerKeyVersion: number;
};
type RewrapRequest = {
  id: string;
  operation: "REWRAP";
  privateKey: CryptoKey;
  documents: Array<{ documentId: string; ownerWrappedKey: string }>;
  recipients: PreparedRecipient[];
};
type DecryptMetadataRequest = {
  id: string;
  operation: "DECRYPT_METADATA";
  privateKey: CryptoKey;
  documents: EncryptedDocumentDescriptor[];
};
type DecryptRequest = {
  id: string;
  operation: "DECRYPT_DOWNLOAD";
  privateKey: CryptoKey;
  metadata: FileMetadata;
  access: DocumentDownloadAccess;
};

self.onmessage = async (event: MessageEvent<EncryptRequest | RewrapRequest | DecryptMetadataRequest | DecryptRequest>) => {
  const request = event.data;
  try {
    if (request.operation === "ENCRYPT_UPLOAD") {
      const documentKey = await generateDocumentKey();
      const ownerPublicKey = await importPublicKey(request.ownerPublicKeyJwk);
      const plaintext = new Uint8Array(await request.file.arrayBuffer());
      const metadata: FileMetadata = {
        name: request.file.name,
        type: request.file.type || "application/octet-stream",
        size: request.file.size,
        lastModified: request.file.lastModified,
      };
      const encryptedFile = await encryptAes(plaintext, documentKey, fileAad(request.documentId));
      plaintext.fill(0);
      const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
      const encryptedMetadata = await encryptAes(metadataBytes, documentKey, metadataAad(request.documentId));
      metadataBytes.fill(0);
      const wrapped = await wrapDocumentKey(documentKey, ownerPublicKey);
      self.postMessage({ id: request.id, progress: "UPLOADING" });
      const response = await fetch(request.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: encryptedFile.ciphertext,
      });
      if (!response.ok) throw new Error(`Encrypted upload failed (${response.status})`);
      self.postMessage({
        id: request.id,
        ok: true,
        result: {
          ciphertextSize: encryptedFile.ciphertext.byteLength,
          encryptedMetadata: bytesToBase64url(new Uint8Array(encryptedMetadata.ciphertext)),
          metadataIv: bytesToBase64url(encryptedMetadata.iv),
          fileIv: bytesToBase64url(encryptedFile.iv),
          ownerWrappedKey: bytesToBase64url(new Uint8Array(wrapped)),
          ownerKeyVersion: request.ownerKeyVersion,
          etag: response.headers.get("etag"),
        },
      });
      return;
    }

    if (request.operation === "REWRAP") {
      const ready = request.recipients.filter((recipient) => recipient.status === "READY");
      const envelopes = [];
      for (const [index, recipient] of ready.entries()) {
        if (!recipient.publicKeyJwk || !recipient.clerkUserId || !recipient.keyVersion || !recipient.publicKeyFingerprint) {
          throw new Error("Recipient key data is incomplete");
        }
        const publicKey = await importPublicKey(recipient.publicKeyJwk);
        const wrappedDocuments = [];
        for (const document of request.documents) {
          const documentKey = await unwrapDocumentKey(base64urlToBytes(document.ownerWrappedKey), request.privateKey, true);
          const wrapped = await wrapDocumentKey(documentKey, publicKey);
          wrappedDocuments.push({ documentId: document.documentId, wrappedFileKey: bytesToBase64url(new Uint8Array(wrapped)) });
        }
        envelopes.push({
          status: "READY" as const,
          email: recipient.email,
          clerkUserId: recipient.clerkUserId,
          keyVersion: recipient.keyVersion,
          publicKeyFingerprint: recipient.publicKeyFingerprint,
          envelopes: wrappedDocuments,
        });
        self.postMessage({ id: request.id, progress: String(index + 1) });
      }
      self.postMessage({ id: request.id, ok: true, result: envelopes });
      return;
    }

    if (request.operation === "DECRYPT_METADATA") {
      const results = [];
      for (const document of request.documents) {
        if (document.status === "DELETED" || !document.wrappedFileKey || !document.encryptedMetadata || !document.metadataIv) {
          results.push({ documentId: document.documentId, status: "DELETED" as const, metadata: null });
          continue;
        }
        const key = await unwrapDocumentKey(base64urlToBytes(document.wrappedFileKey), request.privateKey);
        const bytes = new Uint8Array(await decryptAes(
          base64urlToBytes(document.encryptedMetadata), key, base64urlToBytes(document.metadataIv), metadataAad(document.documentId),
        ));
        const metadata = JSON.parse(new TextDecoder().decode(bytes)) as FileMetadata;
        bytes.fill(0);
        results.push({ documentId: document.documentId, status: "READY" as const, metadata });
      }
      self.postMessage({ id: request.id, ok: true, result: results });
      return;
    }

    const response = await fetch(request.access.downloadUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Encrypted download failed (${response.status})`);
    const ciphertext = await response.arrayBuffer();
    const key = await unwrapDocumentKey(base64urlToBytes(request.access.wrappedFileKey), request.privateKey);
    const file = await decryptAes(
      ciphertext,
      key,
      base64urlToBytes(request.access.fileIv),
      fileAad(request.access.documentId),
    );
    self.postMessage({ id: request.id, ok: true, result: { metadata: request.metadata, file } }, [file]);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Cryptographic operation failed.",
    });
  }
};

export {};
