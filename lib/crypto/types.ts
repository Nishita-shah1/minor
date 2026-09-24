export type FileMetadata = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

export type KeyBundleResponse = {
  publicKeyJwk: JsonWebKey;
  publicKeyFingerprint: string;
  encryptedPrivateKey: string;
  privateKeyIv: string;
  kdfSalt: string;
  kdfParameters: { memoryBytes: number; operations: number; outputBytes: number };
  keyVersion: number;
};

export type UploadResult = {
  ciphertextSize: number;
  encryptedMetadata: string;
  metadataIv: string;
  fileIv: string;
  ownerWrappedKey: string;
  ownerKeyVersion: number;
  etag: string | null;
};

export type KeySetupResult = {
  privateKey: CryptoKey;
  bundle: KeyBundleResponse;
};

export type EncryptedDocumentDescriptor = {
  documentId: string;
  status: "READY" | "DELETED";
  wrappedFileKey: string | null;
  encryptedMetadata: string | null;
  metadataIv: string | null;
};

export type ShareAccessResponse = {
  groupId: string;
  documents: EncryptedDocumentDescriptor[];
  permission: "VIEW_ONLY" | "VIEW_AND_DOWNLOAD";
  availableFrom: string | null;
  expiresAt: string | null;
};

export type DocumentDownloadAccess = {
  documentId: string;
  downloadUrl: string;
  wrappedFileKey: string;
  fileIv: string;
};

export type PreparedRecipient = {
  email: string;
  status: "READY" | "NOT_ENROLLED";
  clerkUserId?: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyFingerprint?: string;
  keyVersion?: number;
};
