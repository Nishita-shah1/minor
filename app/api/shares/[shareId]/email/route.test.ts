import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), send: vi.fn(), select: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/current-verified-user", () => ({ requireVerifiedUser: mocks.user, AuthenticationError: class extends Error {}, IdentityProviderUnavailableError: class extends Error {} }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: mocks.select, update: mocks.update }) }));
vi.mock("@/lib/email/brevo", () => ({ sendShareEmailBatch: mocks.send }));
vi.mock("@/lib/server/env", () => ({ getAppEnv: () => ({ APP_URL: "https://example.test" }) }));

import { POST } from "./route";

const shareId = "33333333-3333-4333-8333-333333333333";
const attemptId = "22222222-2222-4222-8222-222222222222";
const recipient = "alice@example.test";
const shareUrl = `https://example.test/share/${shareId}`;

function chain(limitValue: unknown) {
  const object: Record<string, () => unknown> = {};
  for (const method of ["from", "where", "set", "innerJoin", "leftJoin"]) object[method] = () => object;
  object.limit = async () => limitValue;
  object.returning = async () => [{ id: shareId }];
  return object;
}

const record = {
  share: { id: shareId, senderClerkUserId: "owner", status: "ACTIVE", emailStatus: "NOT_REQUESTED", recipientEmailNormalized: recipient, groupId: shareId },
  batch: { availableFrom: null, expiresAt: null },
  groupStatus: "READY",
  grantShareId: null,
  grantProof: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ userId: "owner", primaryEmail: "owner@example.test" });
  mocks.select.mockImplementation(() => chain([record]));
  mocks.update.mockImplementation(() => chain(undefined));
  mocks.send.mockResolvedValue(["provider-1"]);
});

describe("share email", () => {
  it("sends the share link", async () => {
    const response = await POST(new Request("https://example.test/api/email", { method: "POST", body: JSON.stringify({ attemptId }) }), { params: Promise.resolve({ shareId }) });
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith([expect.objectContaining({ recipientEmail: recipient, shareUrl })], attemptId, "owner@example.test");
  });
});
