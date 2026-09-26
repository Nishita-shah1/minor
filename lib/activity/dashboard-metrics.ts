import { scoreExposureRisk, type ExposureBand, type SessionSignals } from "@/lib/activity/exposure-risk";

export type DashboardRange = "7" | "30" | "all";

export type RecipientRef = {
  shareId: string;
  recipientName: string | null;
  recipientEmail: string;
  shareStatus: string;
  sharedAt: string;
};

export type DocumentRef = {
  documentId: string;
  groupId: string;
  documentStatus: string;
  groupStatus: string;
  documentCreatedAt: string;
  recipients: RecipientRef[];
};

export type SessionActivity = {
  id: string;
  documentId: string;
  shareId: string;
  openedAt: string;
  estimatedVisibleMs: number;
  screenshotAttemptCount: number;
  printAttemptCount: number;
  visibilityHideCount: number;
  fullscreenExitCount: number;
  pageChangeCount: number;
};

export type ActionCounts = {
  screenshots: number;
  prints: number;
  tabSwitches: number;
  fullscreenExits: number;
  pageChanges: number;
};

export type RecipientMetrics = {
  shareId: string;
  recipientName: string | null;
  recipientEmail: string;
  shareStatus: string;
  views: number;
  screenshots: number;
  prints: number;
  lastViewedAt: string | null;
  exposureRiskPercent: number;
  band: ExposureBand;
};

export type FileMetrics = {
  documentId: string;
  groupId: string;
  documentStatus: string;
  groupStatus: string;
  documentCreatedAt: string;
  recipients: RecipientMetrics[];
  views: number;
  screenshots: number;
  prints: number;
  exposureRiskPercent: number;
  band: ExposureBand;
};

export type TrendPoint = { label: string; views: number; risk: number };

export type BuiltDashboard = {
  comparisonLabel: string | null;
  filesShared: number;
  filesSharedDelta: number | null;
  recipients: number;
  recipientsDelta: number | null;
  views: number;
  viewsDelta: number | null;
  captureAttempts: number;
  captureAttemptsDelta: number | null;
  actions: ActionCounts;
  trends: TrendPoint[];
  files: FileMetrics[];
};

export function buildDashboard(input: {
  documents: DocumentRef[];
  sessions: SessionActivity[];
  range: DashboardRange;
  now: Date;
}): BuiltDashboard {
  const { start, previousStart, days } = rangeBounds(input.range, input.now);
  const currentSessions = input.sessions.filter((session) => inWindow(session.openedAt, start, input.now, true));
  const previousSessions = previousStart && start
    ? input.sessions.filter((session) => inWindow(session.openedAt, previousStart, start, false))
    : [];
  const currentShares = sharesBetween(input.documents, start, input.now, true);
  const previousShares = previousStart && start
    ? sharesBetween(input.documents, previousStart, start, false)
    : null;
  const actions = countActions(currentSessions);
  const previousActions = countActions(previousSessions);

  return {
    comparisonLabel: days ? `${days} days` : null,
    filesShared: currentShares.fileCount,
    filesSharedDelta: previousShares ? currentShares.fileCount - previousShares.fileCount : null,
    recipients: currentShares.recipientCount,
    recipientsDelta: previousShares ? currentShares.recipientCount - previousShares.recipientCount : null,
    views: currentSessions.length,
    viewsDelta: previousShares ? currentSessions.length - previousSessions.length : null,
    captureAttempts: actions.screenshots + actions.prints,
    captureAttemptsDelta: previousShares
      ? (actions.screenshots + actions.prints) - (previousActions.screenshots + previousActions.prints)
      : null,
    actions,
    trends: trendPoints(currentSessions, input.range, input.now),
    files: input.documents
      .map((document) => fileMetrics(document, currentSessions))
      .sort((a, b) => b.documentCreatedAt.localeCompare(a.documentCreatedAt)),
  };
}

export function rangeBounds(range: DashboardRange, now: Date) {
  if (range === "all") return { start: null as Date | null, previousStart: null as Date | null, days: null as number | null };
  const days = range === "7" ? 7 : 30;
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);
  return { start, previousStart, days };
}

function fileMetrics(document: DocumentRef, sessions: SessionActivity[]): FileMetrics {
  const documentSessions = sessions.filter((session) => session.documentId === document.documentId);
  const recipients = document.recipients
    .filter((recipient) => recipient.shareStatus !== "DELETED")
    .map((recipient) => {
      const shareSessions = documentSessions.filter((session) => session.shareId === recipient.shareId);
      const actions = countActions(shareSessions);
      const risk = scoreExposureRisk(signalsFrom(shareSessions));
      const lastViewedAt = shareSessions.reduce<string | null>((latest, session) => {
        if (!latest || session.openedAt > latest) return session.openedAt;
        return latest;
      }, null);
      return {
        shareId: recipient.shareId,
        recipientName: recipient.recipientName,
        recipientEmail: recipient.recipientEmail,
        shareStatus: recipient.shareStatus,
        views: shareSessions.length,
        screenshots: actions.screenshots,
        prints: actions.prints,
        lastViewedAt,
        exposureRiskPercent: risk.percent,
        band: risk.band,
      };
    })
    .sort((a, b) => b.exposureRiskPercent - a.exposureRiskPercent || b.views - a.views);
  const actions = countActions(documentSessions);
  const risk = scoreExposureRisk(signalsFrom(documentSessions));
  return {
    documentId: document.documentId,
    groupId: document.groupId,
    documentStatus: document.documentStatus,
    groupStatus: document.groupStatus,
    documentCreatedAt: document.documentCreatedAt,
    recipients,
    views: documentSessions.length,
    screenshots: actions.screenshots,
    prints: actions.prints,
    exposureRiskPercent: risk.percent,
    band: risk.band,
  };
}

function sharesBetween(documents: DocumentRef[], from: Date | null, to: Date, toInclusive: boolean) {
  const emails = new Set<string>();
  const documentIds = new Set<string>();
  for (const document of documents) {
    for (const recipient of document.recipients) {
      if (recipient.shareStatus === "DELETED") continue;
      if (!inWindow(recipient.sharedAt, from, to, toInclusive)) continue;
      emails.add(recipient.recipientEmail);
      documentIds.add(document.documentId);
    }
  }
  return { fileCount: documentIds.size, recipientCount: emails.size };
}

function inWindow(iso: string, from: Date | null, to: Date, toInclusive: boolean) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < from.getTime()) return false;
  return toInclusive ? time <= to.getTime() : time < to.getTime();
}

function countActions(sessions: SessionActivity[]): ActionCounts {
  return sessions.reduce<ActionCounts>((totals, session) => ({
    screenshots: totals.screenshots + session.screenshotAttemptCount,
    prints: totals.prints + session.printAttemptCount,
    tabSwitches: totals.tabSwitches + session.visibilityHideCount,
    fullscreenExits: totals.fullscreenExits + session.fullscreenExitCount,
    pageChanges: totals.pageChanges + session.pageChangeCount,
  }), { screenshots: 0, prints: 0, tabSwitches: 0, fullscreenExits: 0, pageChanges: 0 });
}

function signalsFrom(sessions: SessionActivity[]): SessionSignals {
  const actions = countActions(sessions);
  return {
    estimatedVisibleMs: sessions.reduce((sum, session) => sum + session.estimatedVisibleMs, 0),
    fullscreenExitCount: actions.fullscreenExits,
    visibilityHideCount: actions.tabSwitches,
    screenshotAttemptCount: actions.screenshots,
    printAttemptCount: actions.prints,
    pageChangeCount: actions.pageChanges,
    sessionCount: sessions.length,
  };
}

function trendPoints(sessions: SessionActivity[], range: DashboardRange, now: Date): TrendPoint[] {
  const { start } = rangeBounds(range, now);
  if (start) {
    const days = range === "7" ? 7 : 30;
    return Array.from({ length: days }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      return point(day, sessions.filter((session) => inWindow(session.openedAt, day, next, false)));
    });
  }
  if (!sessions.length) return [point(now, [])];
  const times = sessions.map((session) => new Date(session.openedAt).getTime());
  const min = Math.min(...times);
  const max = Math.max(now.getTime(), ...times);
  const span = Math.max(1, max - min);
  const bucketCount = span <= 14 * 86_400_000 ? Math.max(1, Math.ceil(span / 86_400_000)) : 12;
  const width = span / bucketCount;
  return Array.from({ length: bucketCount }, (_, index) => {
    const from = min + index * width;
    const to = index === bucketCount - 1 ? max + 1 : min + (index + 1) * width;
    const bucket = sessions.filter((session) => {
      const time = new Date(session.openedAt).getTime();
      return time >= from && time < to;
    });
    return point(new Date(from), bucket);
  });
}

function point(day: Date, sessions: SessionActivity[]): TrendPoint {
  return {
    label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    views: sessions.length,
    risk: scoreExposureRisk(signalsFrom(sessions)).percent,
  };
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
