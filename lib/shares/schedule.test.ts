import { describe, expect, it } from "vitest";
import { validateShareSchedule } from "./schedule";

const now = new Date("2026-09-05T10:00:00.000Z");

describe("share schedule", () => {
  it("accepts no schedule and either optional boundary", () => {
    expect(validateShareSchedule({ availableFrom: null, expiresAt: null }, now)).toBeNull();
    expect(validateShareSchedule({ availableFrom: new Date("2026-09-06T10:00:00Z"), expiresAt: null }, now)).toBeNull();
    expect(validateShareSchedule({ availableFrom: null, expiresAt: new Date("2026-09-06T10:00:00Z") }, now)).toBeNull();
  });

  it("rejects past boundaries and reversed windows", () => {
    expect(validateShareSchedule({ availableFrom: new Date("2026-09-04T10:00:00Z"), expiresAt: null }, now)).toBe("Opening time must be in the future.");
    expect(validateShareSchedule({ availableFrom: null, expiresAt: now }, now)).toBe("Expiry must be in the future.");
    expect(validateShareSchedule({ availableFrom: new Date("2026-09-07T10:00:00Z"), expiresAt: new Date("2026-09-06T10:00:00Z") }, now)).toBe("Expiry must be later than opening.");
  });
});
