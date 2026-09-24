import "server-only";

import { z } from "zod";
import { getAppEnv, getBrevoEnv } from "@/lib/server/env";

const responseSchema = z.object({ messageIds: z.array(z.string()).min(1) });

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export type ShareEmail = {
  recipientEmail: string;
  shareUrl?: string;
  availableFrom?: Date | null;
  expiresAt: Date | null;
};

function emailHtml(message: ShareEmail) {
  const address = escapeHtml(message.recipientEmail);
  const destination = message.shareUrl ?? `${getAppEnv().APP_URL}/sign-up`;
  const action = message.shareUrl ? "Open protected file" : "Create your EchoLeaks account";
  const opening = message.availableFrom
    ? `<p>This access opens on ${escapeHtml(message.availableFrom.toISOString())}.</p>`
    : "";
  const expiry = message.expiresAt
    ? `<p>This access expires on ${escapeHtml(message.expiresAt.toISOString())}.</p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif"><h1>EchoLeaks</h1><p>A protected file group has been shared with <strong>${address}</strong>.</p><p>Sign in with that exact address to continue securely.</p>${opening}${expiry}<p><a href="${escapeHtml(destination)}">${action}</a></p><p>Do not forward this link. Possessing it alone does not grant access.</p></body></html>`;
}

export async function sendShareEmailBatch(
  messages: ShareEmail[],
  idempotencyKey: string,
  replyTo: string | null,
) {
  const env = getBrevoEnv();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      subject: "A protected file was shared with you",
      htmlContent: "A protected EchoLeaks file is waiting for you.",
      headers: { idempotencyKey },
      messageVersions: messages.map((message) => ({
        to: [{ email: message.recipientEmail }],
        htmlContent: emailHtml(message),
      })),
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Brevo rejected the email request (${response.status})`);
  const messageIds = responseSchema.parse(body).messageIds;
  if (messageIds.length !== messages.length) {
    throw new Error("Brevo returned an incomplete batch receipt");
  }
  return messageIds;
}
