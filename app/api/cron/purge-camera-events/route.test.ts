import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ delete: mocks.remove }) }));
vi.mock("@/lib/auth/current-verified-user", () => ({ AuthenticationError: class extends Error {}, IdentityProviderUnavailableError: class extends Error {} }));
import { GET } from "./route";

const originalSecret = process.env.CRON_SECRET;
beforeEach(() => {
  process.env.CRON_SECRET = "disposable-secret";
  vi.clearAllMocks();
  mocks.remove.mockReturnValue({ where: vi.fn(async () => []) });
});
afterEach(() => { if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret; });

describe("camera event retention", () => {
  it("requires the protected cron secret", async () => {
    expect((await GET(new Request("https://example.test/cron"))).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("runs the bounded camera-event deletion with the secret", async () => {
    const response = await GET(new Request("https://example.test/cron", { headers: { authorization: "Bearer disposable-secret" } }));
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(new Date((await response.json()).purgedBefore).getTime()).toBeLessThan(Date.now() - 29 * 24 * 60 * 60 * 1000);
  });
});
