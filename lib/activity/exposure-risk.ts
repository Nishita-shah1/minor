export type SessionSignals = {
  estimatedVisibleMs: number;
  fullscreenExitCount: number;
  visibilityHideCount: number;
  screenshotAttemptCount: number;
  printAttemptCount: number;
  pageChangeCount: number;
  sessionCount: number;
};

export type ExposureBand = "low" | "moderate" | "elevated" | "high";

export type ExposureRiskResult = {
  percent: number;
  band: ExposureBand;
  factors: string[];
};

/** Heuristic exposure risk from disclosed viewing behavior only. Not proof of a leak. */
export function scoreExposureRisk(signals: SessionSignals): ExposureRiskResult {
  let percent = 0;
  const factors: string[] = [];

  const visibleMinutes = Math.max(0, signals.estimatedVisibleMs) / 60_000;
  if (visibleMinutes >= 0.25) {
    const timeScore = Math.min(40, Math.round(visibleMinutes * 8));
    percent += timeScore;
    if (timeScore >= 12) factors.push("Extended estimated visible time");
  }

  if (signals.fullscreenExitCount > 0) {
    percent += Math.min(20, signals.fullscreenExitCount * 5);
    factors.push("Protected view left fullscreen");
  }

  if (signals.visibilityHideCount > 0) {
    percent += Math.min(20, signals.visibilityHideCount * 3);
    factors.push("Tab or window hide while viewing");
  }

  if (signals.screenshotAttemptCount > 0) {
    percent += Math.min(15, signals.screenshotAttemptCount * 15);
    factors.push("Screenshot shortcut was attempted");
  }

  if (signals.printAttemptCount > 0) {
    percent += Math.min(15, signals.printAttemptCount * 15);
    factors.push("Print was attempted");
  }

  if (signals.pageChangeCount >= 5) {
    percent += Math.min(15, (signals.pageChangeCount - 4) * 2);
    factors.push("Many page changes during viewing");
  }

  if (signals.sessionCount >= 4) {
    percent += Math.min(10, (signals.sessionCount - 3) * 2);
    factors.push("Repeated openings of the same copy");
  }

  percent = Math.max(0, Math.min(100, percent));
  return { percent, band: bandForPercent(percent), factors };
}

export function bandForPercent(percent: number): ExposureBand {
  if (percent >= 70) return "high";
  if (percent >= 45) return "elevated";
  if (percent >= 20) return "moderate";
  return "low";
}

export function mergeSignals(parts: SessionSignals[]): SessionSignals {
  return parts.reduce<SessionSignals>(
    (acc, part) => ({
      estimatedVisibleMs: acc.estimatedVisibleMs + part.estimatedVisibleMs,
      fullscreenExitCount: acc.fullscreenExitCount + part.fullscreenExitCount,
      visibilityHideCount: acc.visibilityHideCount + part.visibilityHideCount,
      screenshotAttemptCount: acc.screenshotAttemptCount + part.screenshotAttemptCount,
      printAttemptCount: acc.printAttemptCount + part.printAttemptCount,
      pageChangeCount: acc.pageChangeCount + part.pageChangeCount,
      sessionCount: acc.sessionCount + part.sessionCount,
    }),
    {
      estimatedVisibleMs: 0,
      fullscreenExitCount: 0,
      visibilityHideCount: 0,
      screenshotAttemptCount: 0,
      printAttemptCount: 0,
      pageChangeCount: 0,
      sessionCount: 0,
    },
  );
}

export const EXPOSURE_RISK_DISCLAIMER =
  "Exposure risk is an estimate from disclosed viewing behavior (visible time, fullscreen exits, tab hides, observed screenshot shortcuts, print attempts, page churn). It is not proof of a leak or a hand copy. Phone photos and system tools that do not send a shortcut to the page are not counted. Fingerprint Scan remains a separate investigation tool.";
