import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Env } from "@/lib/server/env";
import { getR2Client } from "./client";

const URL_TTL_SECONDS = 300;

export function createR2ObjectKey(ownerClerkUserId: string) {
  const safeOwner = ownerClerkUserId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `documents/${safeOwner}/${crypto.randomUUID()}.bin`;
}

export async function presignEncryptedUpload(objectKey: string) {
  const env = getR2Env();
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: objectKey,
      ContentType: "application/octet-stream",
    }),
    { expiresIn: URL_TTL_SECONDS },
  );
  return { uploadUrl, expiresInSeconds: URL_TTL_SECONDS };
}

export async function presignEncryptedDownload(objectKey: string) {
  const env = getR2Env();
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey }),
    { expiresIn: URL_TTL_SECONDS },
  );
}

export async function assertEncryptedObject(objectKey: string, expectedSize: number) {
  const env = getR2Env();
  const object = await getR2Client().send(
    new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey }),
  );
  if (object.ContentLength !== expectedSize) {
    throw new Error("Encrypted object size does not match finalization request");
  }
}

export async function deleteEncryptedObject(objectKey: string) {
  const env = getR2Env();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey }));
}
