"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type ManualInstall = "ios" | "mac" | "android" | "desktop" | null;
const DISMISSED_KEY = "echoleaks-install-dismissed-at";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function manualInstallPlatform(): ManualInstall {
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(agent)) return "android";
  if (/Macintosh/.test(agent) && /Safari/.test(agent) && !/Chrome|Chromium|Edg/.test(agent)) return "mac";
  if (/Chrome|Chromium|Edg/.test(agent)) return "desktop";
  return null;
}

export function InstallPrompt({ onVisibilityChange }: { onVisibilityChange: (visible: boolean) => void }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [manualPlatform, setManualPlatform] = useState<ManualInstall>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    onVisibilityChange(visible);
  }, [onVisibilityChange, visible]);

  useEffect(() => {
    if (isStandalone()) return;
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY));
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DURATION) return;

    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);

    const timer = window.setTimeout(() => {
      const platform = manualInstallPlatform();
      if (platform && !isStandalone()) {
        setManualPlatform(platform);
        setVisible(true);
      }
    }, 3000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    setInstallEvent(null);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      // The browser may withdraw an install offer between showing and clicking it.
    } finally {
      setVisible(false);
    }
  };

  const instructions = manualPlatform === "ios"
    ? "Tap Share, then Add to Home Screen."
    : manualPlatform === "mac"
      ? "In Safari, choose File → Add to Dock."
      : manualPlatform === "android"
        ? "Open your browser menu and choose Install app or Add to Home screen."
        : "Open your browser menu and choose Install EchoLeaks.";

  return (
    <aside aria-label="Install EchoLeaks" className="absolute bottom-5 left-5 z-30 w-[min(18rem,calc(100vw-2.5rem))] rounded-xl border-2 border-black bg-background p-3 text-black shadow-md sm:bottom-32">
      <button type="button" onClick={dismiss} aria-label="Dismiss install suggestion" className="absolute right-2 top-2 rounded-full p-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">
        <X className="size-4" aria-hidden />
      </button>
      <p className="pr-6 text-sm font-bold">Install EchoLeaks</p>
      <p className="mt-1 text-xs leading-snug">Open EchoLeaks like an app from your desktop or home screen.</p>
      {installEvent ? (
        <button type="button" onClick={() => void install()} className="mt-3 inline-flex items-center gap-2 rounded-full border-2 border-black bg-primary px-4 py-1.5 text-xs font-semibold shadow-sm hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2">
          <Download className="size-4" aria-hidden /> Install app
        </button>
      ) : (
        <p className="mt-2 text-xs font-medium">{instructions}</p>
      )}
    </aside>
  );
}
