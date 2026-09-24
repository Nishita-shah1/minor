import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthenticationError } from "@/lib/auth/current-verified-user";
import { RequestValidationError, safeRouteError } from "./http";

describe("safe route errors", () => {
  it("returns a structured 401 for missing authentication", async () => {
    const response = safeRouteError(new AuthenticationError("Authentication required"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("returns a structured 400 for invalid identifiers", async () => {
    const response = safeRouteError(new RequestValidationError("Invalid identifier"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_IDENTIFIER" } });
  });
});
