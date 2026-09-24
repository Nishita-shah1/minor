import type {
  KeyBundleResponse,
  KeySetupResult,
  PreparedRecipient,
  DocumentDownloadAccess,
  EncryptedDocumentDescriptor,
  UploadResult,
} from "./types";

type WorkerResponse<T> = { id: string; ok: true; result: T } | { id: string; ok: false; error: string };

function runWorker<T>(
  worker: Worker,
  payload: object,
  onProgress?: (phase: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const stop = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      stop();
      reject(new DOMException("Operation cancelled", "AbortError"));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResponse<T>>) => {
      if (event.data.id !== id) return;
      if ("progress" in event.data) {
        onProgress?.(String(event.data.progress));
        return;
      }
      stop();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      stop();
      reject(new Error("The encryption worker stopped unexpectedly."));
    };
    worker.postMessage({ id, ...payload });
  });
}

const keyWorker = () => new Worker(new URL("../../workers/key-vault.worker.ts", import.meta.url), { type: "module" });
const fileWorker = () => new Worker(new URL("../../workers/file-crypto.worker.ts", import.meta.url), { type: "module" });

export function setupKeyVault(clerkUserId: string, passphrase: string) {
  return runWorker<KeySetupResult>(keyWorker(), { operation: "SETUP", clerkUserId, passphrase });
}

export function recoverKeyVault(clerkUserId: string, passphrase: string, bundle: KeyBundleResponse) {
  return runWorker<{ privateKey: CryptoKey }>(keyWorker(), { operation: "RECOVER", clerkUserId, passphrase, bundle });
}

export function encryptAndUpload(payload: {
  file: File;
  documentId: string;
  uploadUrl: string;
  ownerPublicKeyJwk: JsonWebKey;
  ownerKeyVersion: number;
}, onProgress?: (phase: string) => void, signal?: AbortSignal) {
  return runWorker<UploadResult>(fileWorker(), { operation: "ENCRYPT_UPLOAD", ...payload }, onProgress, signal);
}

export function rewrapForRecipients(payload: {
  privateKey: CryptoKey;
  documents: Array<{ documentId: string; ownerWrappedKey: string }>;
  recipients: PreparedRecipient[];
}, onProgress?: (completedRecipients: number) => void) {
  return runWorker<Array<{
    status: "READY";
    email: string;
    clerkUserId: string;
    keyVersion: number;
    publicKeyFingerprint: string;
    envelopes: Array<{ documentId: string; wrappedFileKey: string }>;
  }>>(fileWorker(), { operation: "REWRAP", ...payload }, (progress) => onProgress?.(Number(progress)));
}

export function decryptMetadata(privateKey: CryptoKey, documents: EncryptedDocumentDescriptor[]) {
  return runWorker<Array<{ documentId: string; status: "READY" | "DELETED"; metadata: FileMetadata | null }>>(
    fileWorker(), { operation: "DECRYPT_METADATA", privateKey, documents },
  );
}

export function decryptDownload(privateKey: CryptoKey, metadata: FileMetadata, access: DocumentDownloadAccess) {
  return runWorker<{ metadata: FileMetadata; file: ArrayBuffer }>(fileWorker(), {
    operation: "DECRYPT_DOWNLOAD",
    privateKey,
    metadata,
    access,
  });
}

import type { FileMetadata } from "./types";
