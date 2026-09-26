import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), select: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/auth/current-verified-user", () => ({ requireVerifiedUser: mocks.user, AuthenticationError: class extends Error {}, IdentityProviderUnavailableError: class extends Error {} }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: mocks.select, insert: mocks.insert }) }));
import { GET, POST } from "./route";

const shareId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ shareId }) };
function chain(rows: unknown[]) {
  const value = { from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(async () => rows) };
  value.from.mockReturnValue(value); value.where.mockReturnValue(value); value.orderBy.mockReturnValue(value);
  return value;
}
function post(body: unknown) {
  return new Request("https://example.test/events", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ userId: "recipient" });
  mocks.select.mockImplementation(() => chain([{ recipient: "recipient", sender: "owner", cameraRequired: true }]));
  mocks.insert.mockReturnValue({ values: vi.fn(async () => []) });
});

describe("camera event boundary", () => {
  it("records a recipient state change with session metadata only", async () => {
    const response = await POST(post({ eventType: "FACE_MISSING", sessionId, durationMs: 2000 }), context);
    expect(response.status).toBe(201);
    expect(mocks.insert.mock.results[0].value.values).toHaveBeenCalledWith({ shareId, clerkUserId: "recipient", eventType: "FACE_MISSING", sessionId, durationMs: 2000 });
  });
  it("rejects another account, webcam-off links, and frame payloads", async () => {
    mocks.user.mockResolvedValue({ userId: "stranger" });
    expect((await POST(post({ eventType: "FACE_VERIFIED", sessionId }), context)).status).toBe(403);
    mocks.user.mockResolvedValue({ userId: "recipient" });
    mocks.select.mockImplementation(() => chain([{ recipient: "recipient", cameraRequired: false }]));
    expect((await POST(post({ eventType: "FACE_VERIFIED", sessionId }), context)).status).toBe(400);
    expect((await POST(post({ eventType: "FACE_VERIFIED", sessionId, frame: "pixels" }), context)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("shows the bounded event list only to its owner", async () => {
    mocks.select.mockImplementationOnce(() => chain([{ sender: "owner" }]));
    expect((await GET(new Request("https://example.test/events"), context)).status).toBe(403);
    mocks.user.mockResolvedValue({ userId: "owner" });
    mocks.select.mockReset();
    mocks.select.mockImplementationOnce(() => chain([{ sender: "owner" }])).mockImplementationOnce(() => chain([{ eventType: "FACE_VERIFIED", sessionId }]));
    const response = await GET(new Request("https://example.test/events"), context);
    expect(response.status).toBe(200);
    expect((await response.json()).events).toHaveLength(1);
  });
});
