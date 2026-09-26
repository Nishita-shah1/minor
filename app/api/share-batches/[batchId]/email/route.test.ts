import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), send: vi.fn(), batch: vi.fn(), select: vi.fn(), update: vi.fn(), keys: vi.fn() }));
vi.mock("@/lib/auth/current-verified-user", () => ({ requireVerifiedUser: mocks.user, AuthenticationError: class extends Error {}, IdentityProviderUnavailableError: class extends Error {} }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: mocks.select, update: mocks.update, batch: mocks.batch }) }));
vi.mock("@/lib/email/brevo", () => ({ sendShareEmailBatch: mocks.send }));
vi.mock("@/lib/openpgp/published-keys", () => ({ publishedOpenPgpKeys: mocks.keys }));
vi.mock("@/lib/server/env", () => ({ getAppEnv: () => ({ APP_URL: "https://example.test" }) }));
import { POST } from "./route";
const batchId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const shareId = "33333333-3333-4333-8333-333333333333";
let stored: Record<string, unknown>;
function chain(value?: unknown) {
  const object: Record<string, unknown> = {};
  for (const method of ["from", "where", "set", "for", "returning"]) object[method] = vi.fn(() => object);
  object.limit = vi.fn(async () => value);
  return object;
}
const request = () => new Request("https://example.test/api/email", { method: "POST", body: JSON.stringify({ attemptId }) });
const context = { params: Promise.resolve({ batchId }) };
beforeEach(() => {
  vi.clearAllMocks();
  stored = { id: batchId, groupId: batchId, emailStatus: "NOT_REQUESTED", emailAttemptId: null, expiresAt: null, availableFrom: null };
  mocks.user.mockResolvedValue({ userId: "owner", primaryEmail: "owner@example.test" });
  mocks.select.mockImplementation(() => chain([stored]));
  mocks.update.mockImplementation(() => chain());
  mocks.batch.mockResolvedValue([[], [{ id: batchId }], [{ id: shareId, recipientEmailNormalized: "alice@example.test" }]]);
  mocks.send.mockResolvedValue(["provider-1"]);
  mocks.keys.mockResolvedValue(new Map());
});
describe("owner email attempts", () => {
  it("sends the same persisted link through Brevo with an explicit attempt key", async () => {
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith([{ recipientEmail: "alice@example.test", shareUrl: `https://example.test/share/${shareId}`, availableFrom: null, expiresAt: null }], attemptId, "owner@example.test");
  });
  it("does not resend an accepted retry", async () => {
    Object.assign(stored, { emailStatus: "ACCEPTED", emailAttemptId: attemptId });
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("allows an explicit new resend attempt", async () => {
    Object.assign(stored, { emailStatus: "ACCEPTED", emailAttemptId: batchId });
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not send when another request owns the claim", async () => {
    mocks.batch.mockResolvedValue([[], [], []]);
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects missing ownership", async () => {
    mocks.select.mockImplementation(() => chain([]));
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects expired access and invalid attempt IDs", async () => {
    stored.expiresAt = new Date(0);
    expect((await POST(request(), context)).status).toBe(409);
    expect((await POST(new Request("https://example.test", {method:"POST",body:'{"attemptId":"bad"}'}), context)).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send a plaintext link when a recipient published an OpenPGP key", async () => {
    mocks.keys.mockResolvedValue(new Map([["alice@example.test", { armoredPublicKey: "key", fingerprint: "abc" }]]));
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send when no active recipients remain", async () => {
    mocks.batch.mockResolvedValue([[], [{ id: batchId }], []]);
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
