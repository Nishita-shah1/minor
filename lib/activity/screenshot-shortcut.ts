type ShortcutEvent = {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
};

/** Shortcuts the page can observe. Phone photos and OS tools that swallow the key are not visible here. */
export function isScreenshotShortcut(event: ShortcutEvent) {
  if (event.repeat) return false;
  if (event.key === "PrintScreen") return true;
  const key = event.key.toLowerCase();
  return event.metaKey && event.shiftKey && (key === "3" || key === "4" || key === "5");
}
