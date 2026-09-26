import { z } from "zod";
import { MAX_GROUP_FILES, MAX_RECIPIENTS } from "@/lib/crypto/constants";

export const base64url = z.string().min(1).max(100_000).regex(/^[A-Za-z0-9_-]+$/);
export const documentId = z.uuid();
export const email = z.email().max(320);
export const permission = z.enum(["VIEW_ONLY", "VIEW_AND_DOWNLOAD"]);
export const createUploadGroup = z.object({ fileCount: z.number().int().min(1).max(MAX_GROUP_FILES) });

export const keyBundleRegistration = z.object({
  publicKeyJwk: z.object({
    kty: z.literal("RSA"),
    n: z.string().length(512).regex(/^[A-Za-z0-9_-]+$/),
    e: z.literal("AQAB"),
    alg: z.literal("RSA-OAEP-256"),
    ext: z.literal(true),
    key_ops: z.tuple([z.literal("wrapKey")]),
  }).passthrough(),
  publicKeyFingerprint: z.string().length(64).regex(/^[a-f0-9]+$/),
  encryptedPrivateKey: base64url.max(10_000),
  privateKeyIv: base64url.max(64),
  kdfSalt: base64url.max(64),
  kdfParameters: z.object({
    memoryBytes: z.literal(64 * 1024 * 1024),
    operations: z.literal(3),
    outputBytes: z.literal(32),
  }),
  keyVersion: z.literal(1),
});

export const completeDocument = z.object({
  ciphertextSize: z.number().int().min(16).max(25 * 1024 * 1024 + 16),
  encryptedMetadata: base64url.max(32_000),
  metadataIv: base64url.max(64),
  fileIv: base64url.max(64),
  cryptoVersion: z.literal(1),
  ownerWrappedKey: base64url.max(1_000),
  ownerKeyVersion: z.number().int().positive(),
  etag: z.string().max(200).nullable().optional(),
});

export const prepareRecipients = z.object({
  recipientEmails: z.array(email).min(1).max(MAX_RECIPIENTS),
});

export const openPgpPublicKeyBody = z.object({
  armoredPublicKey: z.string().trim().min(1).max(100_000),
});

export const openPgpKeyLookup = z.object({
  emails: z.array(email).min(1).max(MAX_RECIPIENTS),
});

export const createShares = z.object({
  recipients: z.array(z.discriminatedUnion("status", [
    z.object({
      status: z.literal("READY"),
      email,
      clerkUserId: z.string().min(1).max(200),
      keyVersion: z.number().int().positive(),
      publicKeyFingerprint: z.string().length(64),
      envelopes: z.array(z.object({
        documentId,
        wrappedFileKey: base64url.max(1_000),
        fingerprint: z.object({ ownerWrappedKey: base64url.max(1000), recipientWrappedKey: base64url.max(1000), profileId: z.literal("trustmark-q-lab-v2") }).optional(),
      })).min(1).max(MAX_GROUP_FILES),
    }),
    z.object({ status: z.literal("NOT_ENROLLED"), email }),
  ])).min(1).max(MAX_RECIPIENTS),
  permission,
  availableFrom: z.iso.datetime().nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const accessEvent = z.object({
  eventType: z.enum(["DECRYPT_SUCCEEDED", "DECRYPT_FAILED", "DOWNLOAD_REQUESTED"]),
});

export const createViewingSession = z.object({
  documentId: documentId,
  browserFamily: z.enum(["chrome", "firefox", "safari", "edge", "other", "unknown"]),
  platformCategory: z.enum(["windows", "macos", "linux", "chromeos", "unknown"]),
  viewportBucket: z.enum(["below_1024", "1024_1439", "1440_plus", "unknown"]),
  dprBucket: z.enum(["1_or_less", "above_1_to_2", "above_2", "unknown"]),
  webgpuOutcome: z.enum(["ready", "unavailable", "unknown"]),
});

export const sessionEventBatch = z.object({
  events: z.array(z.object({
    sequence: z.number().int().min(1).max(1_000_000),
    eventType: z.enum([
      "HEARTBEAT",
      "VISIBILITY_HIDDEN",
      "VISIBILITY_VISIBLE",
      "FULLSCREEN_ENTER",
      "FULLSCREEN_EXIT",
      "PAGE_CHANGED",
      "PRINT_ATTEMPTED",
      "COVERED",
      "SESSION_CLOSED",
    ]),
    marked: z.boolean(),
    visible: z.boolean(),
    fullscreen: z.boolean(),
    authorized: z.boolean(),
    pageIndex: z.number().int().min(1).max(10_000).nullable().optional(),
  })).min(1).max(20),
});
