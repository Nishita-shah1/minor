export const CRYPTO_VERSION = 1;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_GROUP_FILES = 10;
export const MAX_GROUP_BYTES = 100 * 1024 * 1024;
export const MAX_RECIPIENTS = 100;
export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BITS = 128;
export const RSA_MODULUS_BITS = 3072;
export const KDF_PARAMETERS = {
  memoryBytes: 64 * 1024 * 1024,
  operations: 3,
  outputBytes: 32,
} as const;
