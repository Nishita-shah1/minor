export type DisclosedViewerContext = {
  browserFamily: "chrome" | "firefox" | "safari" | "edge" | "other" | "unknown";
  platformCategory: "windows" | "macos" | "linux" | "chromeos" | "unknown";
  viewportBucket: "below_1024" | "1024_1439" | "1440_plus" | "unknown";
  dprBucket: "1_or_less" | "above_1_to_2" | "above_2" | "unknown";
  webgpuOutcome: "ready" | "unavailable" | "unknown";
};

export function bucketViewportWidth(width: number | null | undefined): DisclosedViewerContext["viewportBucket"] {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return "unknown";
  if (width < 1024) return "below_1024";
  if (width < 1440) return "1024_1439";
  return "1440_plus";
}

export function bucketDpr(dpr: number | null | undefined): DisclosedViewerContext["dprBucket"] {
  if (typeof dpr !== "number" || !Number.isFinite(dpr) || dpr <= 0) return "unknown";
  if (dpr <= 1) return "1_or_less";
  if (dpr <= 2) return "above_1_to_2";
  return "above_2";
}

export function bucketBrowserFamily(ua: string | null | undefined): DisclosedViewerContext["browserFamily"] {
  if (!ua) return "unknown";
  const value = ua.toLowerCase();
  if (value.includes("edg/")) return "edge";
  if (value.includes("chrome/") || value.includes("crios/")) return "chrome";
  if (value.includes("firefox/") || value.includes("fxios/")) return "firefox";
  if (value.includes("safari/") && !value.includes("chrome/") && !value.includes("chromium/")) return "safari";
  return "other";
}

export function bucketPlatform(ua: string | null | undefined): DisclosedViewerContext["platformCategory"] {
  if (!ua) return "unknown";
  const value = ua.toLowerCase();
  if (value.includes("cros")) return "chromeos";
  if (value.includes("windows")) return "windows";
  if (value.includes("mac os") || value.includes("macintosh")) return "macos";
  if (value.includes("linux") || value.includes("android")) return "linux";
  return "unknown";
}

/** Collect disclosed buckets in the recipient browser. Never send raw UA to the server. */
export function collectDisclosedViewerContext(webgpuOutcome: DisclosedViewerContext["webgpuOutcome"] = "unknown"): DisclosedViewerContext {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return {
      browserFamily: "unknown",
      platformCategory: "unknown",
      viewportBucket: "unknown",
      dprBucket: "unknown",
      webgpuOutcome,
    };
  }
  return {
    browserFamily: bucketBrowserFamily(navigator.userAgent),
    platformCategory: bucketPlatform(navigator.userAgent),
    viewportBucket: bucketViewportWidth(window.innerWidth),
    dprBucket: bucketDpr(window.devicePixelRatio),
    webgpuOutcome,
  };
}
