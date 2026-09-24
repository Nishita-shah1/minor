import "server-only";

import { z } from "zod";

const databaseEnvSchema = z.object({ DATABASE_URL: z.string().url() });
const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
});
const brevoEnvSchema = z.object({
  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.email(),
  BREVO_SENDER_NAME: z.string().min(1).default("EchoLeaks"),
});
const appEnvSchema = z.object({ APP_URL: z.url() });

type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
type R2Env = z.infer<typeof r2EnvSchema>;
type BrevoEnv = z.infer<typeof brevoEnvSchema>;
type AppEnv = z.infer<typeof appEnvSchema>;

let databaseEnv: DatabaseEnv | undefined;
let r2Env: R2Env | undefined;
let brevoEnv: BrevoEnv | undefined;
let appEnv: AppEnv | undefined;

export function getDatabaseEnv() {
  databaseEnv ??= databaseEnvSchema.parse(process.env);
  return databaseEnv;
}

export function getR2Env() {
  r2Env ??= r2EnvSchema.parse(process.env);
  return r2Env;
}

export function getBrevoEnv() {
  brevoEnv ??= brevoEnvSchema.parse(process.env);
  return brevoEnv;
}

export function getAppEnv() {
  appEnv ??= appEnvSchema.parse(process.env);
  return appEnv;
}
