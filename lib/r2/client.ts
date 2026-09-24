import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { getR2Env } from "@/lib/server/env";

let client: S3Client | undefined;

export function getR2Client() {
  const env = getR2Env();
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}
