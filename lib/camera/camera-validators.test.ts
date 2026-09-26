import { describe, expect, it } from "vitest";
import { accessEvent, createShares } from "@/lib/server/validators";

describe("camera request boundaries", () => {
  it("defaults an unconfigured recipient link to webcam off", () => {
    const value = createShares.parse({ recipients: [{ status: "NOT_ENROLLED", email: "person@example.com" }], permission: "VIEW_ONLY" });
    expect(value.recipients[0].cameraRequired).toBe(false);
  });
  it("requires a session for camera events and rejects frame payloads", () => {
    const sessionId = crypto.randomUUID();
    expect(accessEvent.safeParse({ eventType: "FACE_VERIFIED" }).success).toBe(false);
    expect(accessEvent.safeParse({ eventType: "FACE_VERIFIED", sessionId, frame: "camera bytes" }).success).toBe(false);
    expect(accessEvent.safeParse({ eventType: "FACE_VERIFIED", sessionId }).success).toBe(true);
  });
});
