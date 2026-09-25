import { AuthenticationError, IdentityProviderUnavailableError } from "@/lib/auth/current-verified-user";
import { z } from "zod";

export class RequestValidationError extends Error {}

export function requireUuid(value: string) {
  if (!z.uuid().safeParse(value).success) throw new RequestValidationError("The resource identifier is invalid.");
  return value;
}

export const sensitiveHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...sensitiveHeaders, ...init.headers },
  });
}

export function safeRouteError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return json({ error: { code: "UNAUTHENTICATED", message: error.message } }, { status: 401 });
  }
  if (error instanceof RequestValidationError) {
    return json({ error: { code: "INVALID_IDENTIFIER", message: error.message } }, { status: 400 });
  }
  if (error instanceof IdentityProviderUnavailableError) {
    console.error("EchoLeaks account verification unavailable");
    return json({ error: { code: "IDENTITY_PROVIDER_UNAVAILABLE", message: error.message } }, { status: 503 });
  }
  console.error("EchoLeaks route failed", error instanceof Error
    ? { name: error.name, message: error.message || "No error message", cause: error.cause instanceof Error ? error.cause.name : undefined }
    : { name: typeof error });
  return json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
    { status: 500 },
  );
}
