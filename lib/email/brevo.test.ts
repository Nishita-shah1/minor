import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendShareEmailBatch } from "./brevo";

beforeAll(() => {
  process.env.APP_URL = "https://echoleaks.vercel.app";
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.BREVO_SENDER_EMAIL = "verified@example.com";
  process.env.BREVO_SENDER_NAME = "EchoLeaks";
});

describe("Brevo batch delivery", () => {
  it("creates one personalized message version per recipient", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messageIds: ["message-1", "message-2"],
    }), { status: 201 }));
    vi.stubGlobal("fetch", request);

    await expect(sendShareEmailBatch([
      { recipientEmail: "alice@example.com", shareUrl: "https://echoleaks.vercel.app/share/one", expiresAt: null },
      { recipientEmail: "bob@example.com", shareUrl: "https://echoleaks.vercel.app/share/two", expiresAt: null },
    ], "batch-id", "sender@example.com")).resolves.toEqual(["message-1", "message-2"]);

    const [, init] = request.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.headers).toEqual({ idempotencyKey: "batch-id" });
    expect(body.replyTo).toEqual({ email: "sender@example.com" });
    expect(body.messageVersions).toHaveLength(2);
    expect(body.messageVersions[0].htmlContent).toContain("/share/one");
  });

  it("rejects an incomplete provider receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messageIds: ["message-1"],
    }), { status: 201 })));

    await expect(sendShareEmailBatch([
      { recipientEmail: "alice@example.com", expiresAt: null },
      { recipientEmail: "bob@example.com", expiresAt: null },
    ], "batch-id", null)).rejects.toThrow("incomplete batch receipt");
  });
});
