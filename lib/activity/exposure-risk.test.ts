import { describe, expect, it } from "vitest";
import { bandForPercent, mergeSignals, scoreExposureRisk } from "@/lib/activity/exposure-risk";
import { creditVisibleInterval, observationCreditsVisibleTime } from "@/lib/activity/visible-time";
import { bucketBrowserFamily, bucketDpr, bucketPlatform, bucketViewportWidth } from "@/lib/activity/context-buckets";

describe("scoreExposureRisk", () => {
  it("stays low without behavior signals", () => {
    const result = scoreExposureRisk({
      estimatedVisibleMs: 0,
      fullscreenExitCount: 0,
      visibilityHideCount: 0,
      printAttemptCount: 0,
      pageChangeCount: 0,
      sessionCount: 1,
    });
    expect(result.percent).toBe(0);
    expect(result.band).toBe("low");
  });

  it("raises risk for long visible time and capture proxies", () => {
    const result = scoreExposureRisk({
      estimatedVisibleMs: 5 * 60_000,
      fullscreenExitCount: 2,
      visibilityHideCount: 3,
      printAttemptCount: 1,
      pageChangeCount: 8,
      sessionCount: 5,
    });
    expect(result.percent).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe("high");
    expect(result.factors.length).toBeGreaterThan(2);
  });

  it("maps bands", () => {
    expect(bandForPercent(10)).toBe("low");
    expect(bandForPercent(25)).toBe("moderate");
    expect(bandForPercent(50)).toBe("elevated");
    expect(bandForPercent(80)).toBe("high");
  });

  it("merges session signals", () => {
    const merged = mergeSignals([
      { estimatedVisibleMs: 1000, fullscreenExitCount: 1, visibilityHideCount: 0, printAttemptCount: 0, pageChangeCount: 1, sessionCount: 1 },
      { estimatedVisibleMs: 2000, fullscreenExitCount: 0, visibilityHideCount: 2, printAttemptCount: 1, pageChangeCount: 3, sessionCount: 2 },
    ]);
    expect(merged).toEqual({
      estimatedVisibleMs: 3000,
      fullscreenExitCount: 1,
      visibilityHideCount: 2,
      printAttemptCount: 1,
      pageChangeCount: 4,
      sessionCount: 3,
    });
  });
});

describe("visible time credit", () => {
  it("credits at most 15 seconds and resets after long gaps", () => {
    const t0 = new Date("2026-09-26T09:00:00.000Z");
    const t1 = new Date("2026-09-26T09:00:20.000Z");
    const t2 = new Date("2026-09-26T09:01:00.000Z");
    expect(observationCreditsVisibleTime({ marked: true, visible: true, fullscreen: true, authorized: true })).toBe(true);
    expect(creditVisibleInterval(null, t0, true)).toEqual({ creditMs: 0, nextCreditAt: t0 });
    expect(creditVisibleInterval(t0, t1, true).creditMs).toBe(15_000);
    expect(creditVisibleInterval(t0, t2, true).creditMs).toBe(0);
  });
});

describe("context buckets", () => {
  it("buckets browser platform viewport and dpr", () => {
    expect(bucketBrowserFamily("Mozilla/5.0 Chrome/120.0")).toBe("chrome");
    expect(bucketPlatform("Mozilla/5.0 (Windows NT 10.0)")).toBe("windows");
    expect(bucketViewportWidth(900)).toBe("below_1024");
    expect(bucketViewportWidth(1200)).toBe("1024_1439");
    expect(bucketViewportWidth(1600)).toBe("1440_plus");
    expect(bucketDpr(1)).toBe("1_or_less");
    expect(bucketDpr(1.5)).toBe("above_1_to_2");
    expect(bucketDpr(3)).toBe("above_2");
  });
});
