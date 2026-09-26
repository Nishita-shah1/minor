import { describe, expect, it } from "vitest";
import { CameraSecurityMachine } from "./security-machine";

function verified() {
  const machine = new CameraSecurityMachine();
  machine.observe({ now: 0, faceCount: 1 });
  machine.observe({ now: 250, faceCount: 1 });
  expect(machine.observe({ now: 500, faceCount: 1 }).events.map(event => event.type)).toEqual(["FACE_VERIFIED"]);
  return machine;
}

describe("CameraSecurityMachine", () => {
  it("requires three consecutive one-face checks before verification", () => {
    const machine = new CameraSecurityMachine();
    machine.observe({ now: 0, faceCount: 1 });
    machine.observe({ now: 250, faceCount: 0 });
    machine.observe({ now: 500, faceCount: 1 });
    expect(machine.observe({ now: 750, faceCount: 1 }).status).toBe("verifying");
    expect(machine.observe({ now: 1000, faceCount: 1 }).status).toBe("verified");
  });

  it("tolerates short absence, blurs at two seconds, locks at four, then requires fresh checks", () => {
    const machine = verified();
    expect(machine.observe({ now: 750, faceCount: 0 }).status).toBe("verified");
    expect(machine.observe({ now: 2749, faceCount: 0 }).status).toBe("verified");
    expect(machine.observe({ now: 2750, faceCount: 0 }).events.map(event => event.type)).toEqual(["FACE_MISSING", "VIEWER_BLURRED"]);
    expect(machine.observe({ now: 4750, faceCount: 0 }).events.map(event => event.type)).toEqual(["VIEWER_LOCKED"]);
    expect(machine.observe({ now: 5000, faceCount: 1 }).status).toBe("locked");
    expect(machine.observe({ now: 5250, faceCount: 1 }).status).toBe("locked");
    expect(machine.observe({ now: 5500, faceCount: 1 }).events.map(event => event.type)).toEqual(["CAMERA_RESTORED", "FACE_VERIFIED", "VIEWER_UNLOCKED"]);
  });

  it("covers multiple faces immediately and locks only after sustained detection", () => {
    const machine = verified();
    expect(machine.observe({ now: 750, faceCount: 2 }).status).toBe("blurred");
    expect(machine.observe({ now: 2749, faceCount: 2 }).status).toBe("blurred");
    expect(machine.observe({ now: 2750, faceCount: 2 }).events.map(event => event.type)).toEqual(["MULTIPLE_FACES", "VIEWER_LOCKED"]);
  });

  it("locks obscured and muted cameras after 1.5 seconds, and lost or stalled cameras immediately", () => {
    const obscured = verified();
    expect(obscured.observe({ now: 750, faceCount: 0, obscured: true }).status).toBe("blurred");
    expect(obscured.observe({ now: 2250, faceCount: 0, obscured: true }).events.map(event => event.type)).toEqual(["CAMERA_OBSCURED", "VIEWER_LOCKED"]);
    const muted = verified();
    muted.observe({ now: 750, faceCount: 0, muted: true });
    expect(muted.observe({ now: 2250, faceCount: 0, muted: true }).events.map(event => event.type)).toEqual(["CAMERA_STALLED", "VIEWER_LOCKED"]);
    expect(verified().observe({ now: 750, faceCount: 0, stalled: true }).events.map(event => event.type)).toEqual(["CAMERA_STALLED", "VIEWER_LOCKED"]);
    expect(verified().observe({ now: 750, faceCount: 0, trackEnded: true }).events.map(event => event.type)).toEqual(["CAMERA_LOST", "VIEWER_LOCKED"]);
  });

  it("records a new camera-loss reason once after another lock", () => {
    const machine = verified();
    machine.observe({ now: 750, faceCount: 0, stalled: true });
    expect(machine.observe({ now: 1000, faceCount: 0, trackEnded: true }).events.map(event => event.type)).toEqual(["CAMERA_LOST"]);
    expect(machine.observe({ now: 1250, faceCount: 0, trackEnded: true }).events).toEqual([]);
  });
});
