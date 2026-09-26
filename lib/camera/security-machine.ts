import type { CameraEventType } from "./events";

export type CameraSecurityStatus = "verifying" | "verified" | "blurred" | "locked";
export type CameraObservation = {
  now: number;
  faceCount: number;
  obscured?: boolean;
  stalled?: boolean;
  muted?: boolean;
  trackEnded?: boolean;
};
export type CameraTransition = { status: CameraSecurityStatus; events: Array<{ type: CameraEventType; durationMs?: number }> };

const FACE_WARN_MS = 2000;
const FACE_LOCK_MS = 4000;
const MULTIPLE_LOCK_MS = 2000;
const SIGNAL_LOCK_MS = 1500;

// YuNet supplies only a face count. All timing and camera-integrity policy lives here.
export class CameraSecurityMachine {
  private current: CameraSecurityStatus = "verifying";
  private goodFrames = 0;
  private missingSince: number | null = null;
  private multipleSince: number | null = null;
  private obscuredSince: number | null = null;
  private mutedSince: number | null = null;
  private lastLockReason: CameraEventType | null = null;

  get status() { return this.current; }

  lock(type?: CameraEventType): CameraTransition {
    if (this.current === "locked") {
      if (type && type !== this.lastLockReason) { this.lastLockReason = type; return { status: this.current, events: [{ type }] }; }
      return { status: this.current, events: [] };
    }
    this.current = "locked";
    this.lastLockReason = type ?? null;
    this.goodFrames = 0;
    return { status: this.current, events: [...(type ? [{ type }] : []), { type: "VIEWER_LOCKED" }] };
  }

  observe(input: CameraObservation): CameraTransition {
    const { now, faceCount } = input;
    if (input.trackEnded) return this.lock("CAMERA_LOST");
    this.mutedSince = input.muted ? this.mutedSince ?? now : null;
    this.obscuredSince = input.obscured ? this.obscuredSince ?? now : null;
    if (input.stalled || (this.mutedSince !== null && now - this.mutedSince >= SIGNAL_LOCK_MS)) return this.lock("CAMERA_STALLED");
    if (this.obscuredSince !== null && now - this.obscuredSince >= SIGNAL_LOCK_MS) return this.lock("CAMERA_OBSCURED");
    if (input.muted || input.obscured) return this.blur();

    this.multipleSince = faceCount >= 2 ? this.multipleSince ?? now : null;
    this.missingSince = faceCount === 0 ? this.missingSince ?? now : null;
    if (this.multipleSince !== null) {
      this.goodFrames = 0;
      if (now - this.multipleSince >= MULTIPLE_LOCK_MS) return this.lock("MULTIPLE_FACES");
      return this.blur();
    }
    if (this.missingSince !== null) {
      this.goodFrames = 0;
      const duration = now - this.missingSince;
      if (duration >= FACE_LOCK_MS) {
        if (this.current === "locked") return { status: this.current, events: [] };
        const missedWarning = this.current === "verified";
        const transition = this.lock();
        return { ...transition, events: [...(missedWarning ? [{ type: "FACE_MISSING" as const, durationMs: duration }] : []), ...transition.events] };
      }
      if (duration >= FACE_WARN_MS && this.current === "verified") {
        this.current = "blurred";
        return { status: this.current, events: [{ type: "FACE_MISSING", durationMs: duration }, { type: "VIEWER_BLURRED" }] };
      }
      return { status: this.current, events: [] };
    }

    this.goodFrames++;
    if (this.goodFrames < 3 || this.current === "verified") return { status: this.current, events: [] };
    const recovering = this.current === "blurred" || this.current === "locked";
    this.current = "verified";
    this.lastLockReason = null;
    return { status: this.current, events: recovering
      ? [{ type: "CAMERA_RESTORED" }, { type: "FACE_VERIFIED" }, { type: "VIEWER_UNLOCKED" }]
      : [{ type: "FACE_VERIFIED" }] };
  }

  private blur(): CameraTransition {
    this.goodFrames = 0;
    if (this.current !== "verified") return { status: this.current, events: [] };
    this.current = "blurred";
    return { status: this.current, events: [{ type: "VIEWER_BLURRED" }] };
  }
}
