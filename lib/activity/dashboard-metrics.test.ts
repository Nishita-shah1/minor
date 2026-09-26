import { describe, expect, it } from "vitest";
import { buildDashboard, type DocumentRef, type SessionActivity } from "@/lib/activity/dashboard-metrics";
import { isScreenshotShortcut } from "@/lib/activity/screenshot-shortcut";

const now = new Date(2026, 8, 26, 15, 0, 0);

function at(day: number, hour = 10) {
  return new Date(2026, 8, day, hour, 0, 0).toISOString();
}

function session(patch: Partial<SessionActivity> & Pick<SessionActivity, "id" | "openedAt">): SessionActivity {
  return {
    documentId: "doc-1",
    shareId: "share-1",
    estimatedVisibleMs: 0,
    screenshotAttemptCount: 0,
    printAttemptCount: 0,
    visibilityHideCount: 0,
    fullscreenExitCount: 0,
    pageChangeCount: 0,
    ...patch,
  };
}

const documents: DocumentRef[] = [{
  documentId: "doc-1",
  groupId: "group-1",
  documentStatus: "READY",
  groupStatus: "READY",
  documentCreatedAt: at(10),
  recipients: [
    { shareId: "share-1", recipientName: "Asha", recipientEmail: "asha@example.com", shareStatus: "ACTIVE", sharedAt: at(22) },
    { shareId: "share-2", recipientName: "Ravi", recipientEmail: "ravi@example.com", shareStatus: "ACTIVE", sharedAt: at(12) },
  ],
}];

describe("buildDashboard", () => {
  const sessions = [
    session({ id: "current", openedAt: at(22), screenshotAttemptCount: 2, printAttemptCount: 1, visibilityHideCount: 1 }),
    session({ id: "earlier-view", openedAt: at(23), shareId: "share-1", printAttemptCount: 1 }),
    session({ id: "previous", openedAt: at(15), screenshotAttemptCount: 1 }),
    session({ id: "old", openedAt: at(1), shareId: "share-2" }),
  ];

  it("counts views, screenshots, and prints inside the selected window", () => {
    const dashboard = buildDashboard({ documents, sessions, range: "7", now });
    expect(dashboard.views).toBe(2);
    expect(dashboard.viewsDelta).toBe(1);
    expect(dashboard.captureAttempts).toBe(4);
    expect(dashboard.captureAttemptsDelta).toBe(3);
    expect(dashboard.filesShared).toBe(1);
    expect(dashboard.recipients).toBe(1);
    expect(dashboard.files[0]?.views).toBe(2);
    expect(dashboard.files[0]?.screenshots).toBe(2);
    expect(dashboard.files[0]?.prints).toBe(2);
    const asha = dashboard.files[0]?.recipients.find((recipient) => recipient.shareId === "share-1");
    expect(asha).toMatchObject({ views: 2, screenshots: 2, prints: 2, lastViewedAt: at(23) });
    const ravi = dashboard.files[0]?.recipients.find((recipient) => recipient.shareId === "share-2");
    expect(ravi).toMatchObject({ views: 0, screenshots: 0, prints: 0, lastViewedAt: null });
    expect(dashboard.actions).toMatchObject({ screenshots: 2, prints: 2, tabSwitches: 1 });
    expect(dashboard.trends).toHaveLength(7);
    expect(dashboard.trends.reduce((sum, point) => sum + point.views, 0)).toBe(2);
  });

  it("includes every session when the range is all time", () => {
    const dashboard = buildDashboard({ documents, sessions, range: "all", now });
    expect(dashboard.views).toBe(4);
    expect(dashboard.viewsDelta).toBeNull();
    expect(dashboard.filesShared).toBe(1);
    expect(dashboard.recipients).toBe(2);
    expect(dashboard.captureAttempts).toBe(5);
  });
});

describe("isScreenshotShortcut", () => {
  it("accepts print screen and macOS capture chords", () => {
    expect(isScreenshotShortcut({ key: "PrintScreen", metaKey: false, shiftKey: false, repeat: false })).toBe(true);
    expect(isScreenshotShortcut({ key: "3", metaKey: true, shiftKey: true, repeat: false })).toBe(true);
    expect(isScreenshotShortcut({ key: "s", metaKey: true, shiftKey: true, repeat: false })).toBe(false);
    expect(isScreenshotShortcut({ key: "PrintScreen", metaKey: false, shiftKey: false, repeat: true })).toBe(false);
  });
});
