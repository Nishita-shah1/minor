import { base64urlToBytes, bytesToBase64url } from "@/lib/crypto/base64url";

const context = new TextEncoder().encode("EchoLeaks/invitation-secret/v1\0");

export async function invitationProof(secret: string): Promise<string> {
  const bytes = base64urlToBytes(secret);
  if (bytes.length !== 32) throw new Error("This invitation code is invalid.");
  const input = new Uint8Array(context.length + bytes.length);
  input.set(context);
  input.set(bytes, context.length);
  try {
    return bytesToBase64url(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
  } finally {
    bytes.fill(0);
    input.fill(0);
  }
}
