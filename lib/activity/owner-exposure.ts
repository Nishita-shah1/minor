import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, sessionEvents, shares, uploadGroups, viewingSessions } from "@/lib/db/schema";
import {
  EXPOSURE_RISK_DISCLAIMER,
  mergeSignals,
  scoreExposureRisk,
  type SessionSignals,
} from "@/lib/activity/exposure-risk";

export async function loadOwnerExposureRisk(ownerClerkUserId: string) {
  const ownedDocuments = await getDb().select({
    documentId: documents.id,
    groupId: documents.groupId,
    documentStatus: documents.status,
    documentCreatedAt: documents.createdAt,
    groupCreatedAt: uploadGroups.createdAt,
    groupStatus: uploadGroups.status,
  }).from(documents)
    .innerJoin(uploadGroups, eq(uploadGroups.id, documents.groupId))
    .where(and(
      eq(documents.ownerClerkUserId, ownerClerkUserId),
      ne(documents.status, "DELETED"),
      ne(uploadGroups.status, "DELETED"),
    ));

  if (!ownedDocuments.length) {
    return {
      documents: [],
      disclaimer: EXPOSURE_RISK_DISCLAIMER,
      summary: emptySummary(),
      activity: [],
    };
  }

  const documentIds = ownedDocuments.map((row) => row.documentId);
  const sessions = await getDb().select({
    id: viewingSessions.id,
    documentId: viewingSessions.documentId,
    shareId: viewingSessions.shareId,
    estimatedVisibleMs: viewingSessions.estimatedVisibleMs,
    openedAt: viewingSessions.openedAt,
  }).from(viewingSessions).where(inArray(viewingSessions.documentId, documentIds));

  const sessionIds = sessions.map((session) => session.id);
  const events = sessionIds.length
    ? await getDb().select({
      sessionId: sessionEvents.sessionId,
      eventType: sessionEvents.eventType,
    }).from(sessionEvents).where(inArray(sessionEvents.sessionId, sessionIds))
    : [];

  const groupIds = [...new Set(ownedDocuments.map((document) => document.groupId))];
  const shareRows = await getDb().select({
    id: shares.id,
    groupId: shares.groupId,
    recipientName: shares.recipientName,
    recipientEmailNormalized: shares.recipientEmailNormalized,
    status: shares.status,
    createdAt: shares.createdAt,
  }).from(shares).where(inArray(shares.groupId, groupIds));

  const eventsBySession = new Map<string, string[]>();
  for (const event of events) {
    const list = eventsBySession.get(event.sessionId) ?? [];
    list.push(event.eventType);
    eventsBySession.set(event.sessionId, list);
  }

  const documentsOut = ownedDocuments.map((document) => {
    const documentSessions = sessions.filter((session) => session.documentId === document.documentId);
    const byShare = new Map<string, typeof documentSessions>();
    for (const session of documentSessions) {
      const list = byShare.get(session.shareId) ?? [];
      list.push(session);
      byShare.set(session.shareId, list);
    }

    const groupShares = shareRows.filter((share) => share.groupId === document.groupId && share.status !== "DELETED");
    const recipients = groupShares.map((share) => {
      const shareSessions = byShare.get(share.id) ?? [];
      const signals = signalsForSessions(shareSessions, eventsBySession);
      const risk = scoreExposureRisk(signals);
      return {
        shareId: share.id,
        recipientName: share.recipientName,
        recipientEmail: share.recipientEmailNormalized,
        shareStatus: share.status,
        exposureRiskPercent: risk.percent,
        band: risk.band,
        factors: risk.factors,
        estimatedVisibleMs: signals.estimatedVisibleMs,
        sessionCount: signals.sessionCount,
        fullscreenExitCount: signals.fullscreenExitCount,
        visibilityHideCount: signals.visibilityHideCount,
        printAttemptCount: signals.printAttemptCount,
        pageChangeCount: signals.pageChangeCount,
      };
    }).sort((a, b) => b.exposureRiskPercent - a.exposureRiskPercent);

    const overallSignals = mergeSignals(recipients.map((recipient) => ({
      estimatedVisibleMs: recipient.estimatedVisibleMs,
      fullscreenExitCount: recipient.fullscreenExitCount,
      visibilityHideCount: recipient.visibilityHideCount,
      printAttemptCount: recipient.printAttemptCount,
      pageChangeCount: recipient.pageChangeCount,
      sessionCount: recipient.sessionCount,
    })));
    const overall = scoreExposureRisk(overallSignals);

    return {
      documentId: document.documentId,
      groupId: document.groupId,
      documentStatus: document.documentStatus,
      groupStatus: document.groupStatus,
      groupCreatedAt: document.groupCreatedAt.toISOString(),
      documentCreatedAt: document.documentCreatedAt.toISOString(),
      exposureRiskPercent: overall.percent,
      band: overall.band,
      factors: overall.factors,
      estimatedVisibleMs: overallSignals.estimatedVisibleMs,
      sessionCount: overallSignals.sessionCount,
      recipientCount: recipients.length,
      recipients,
    };
  }).sort((a, b) => b.documentCreatedAt.localeCompare(a.documentCreatedAt));

  const emails = new Set(shareRows.filter((share) => share.status !== "DELETED").map((share) => share.recipientEmailNormalized));
  const buckets = { low: 0, medium: 0, high: 0 };
  for (const document of documentsOut) buckets[riskBucket(document.band)] += 1;
  const overallPercent = documentsOut.length
    ? Math.round(documentsOut.reduce((sum, document) => sum + document.exposureRiskPercent, 0) / documentsOut.length)
    : 0;

  const bandByDocument = new Map(documentsOut.map((document) => [document.documentId, document.band]));
  const activity = [
    ...sessions.map((session) => ({
      id: `view-${session.id}`,
      kind: "viewed" as const,
      documentId: session.documentId,
      at: session.openedAt.toISOString(),
      band: bandByDocument.get(session.documentId) ?? "low",
    })),
    ...shareRows.filter((share) => share.status !== "DELETED").map((share) => {
      const document = ownedDocuments.find((row) => row.groupId === share.groupId);
      return {
        id: `share-${share.id}`,
        kind: "shared" as const,
        documentId: document?.documentId ?? "",
        at: share.createdAt.toISOString(),
        band: bandByDocument.get(document?.documentId ?? "") ?? "low",
      };
    }),
    ...ownedDocuments.map((document) => ({
      id: `upload-${document.documentId}`,
      kind: "uploaded" as const,
      documentId: document.documentId,
      at: document.documentCreatedAt.toISOString(),
      band: bandByDocument.get(document.documentId) ?? "low",
    })),
  ].filter((item) => item.documentId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return {
    documents: documentsOut,
    disclaimer: EXPOSURE_RISK_DISCLAIMER,
    summary: {
      fileCount: documentsOut.length,
      recipientCount: emails.size,
      sessionCount: sessions.length,
      overallPercent,
      ...buckets,
    },
    activity,
  };
}

function emptySummary() {
  return { fileCount: 0, recipientCount: 0, sessionCount: 0, overallPercent: 0, low: 0, medium: 0, high: 0 };
}

function riskBucket(band: string): "low" | "medium" | "high" {
  if (band === "high" || band === "elevated") return "high";
  if (band === "moderate") return "medium";
  return "low";
}

function signalsForSessions(
  sessions: Array<{ id: string; estimatedVisibleMs: number }>,
  eventsBySession: Map<string, string[]>,
): SessionSignals {
  let fullscreenExitCount = 0;
  let visibilityHideCount = 0;
  let printAttemptCount = 0;
  let pageChangeCount = 0;
  let estimatedVisibleMs = 0;
  for (const session of sessions) {
    estimatedVisibleMs += session.estimatedVisibleMs;
    for (const eventType of eventsBySession.get(session.id) ?? []) {
      if (eventType === "FULLSCREEN_EXIT") fullscreenExitCount += 1;
      if (eventType === "VISIBILITY_HIDDEN") visibilityHideCount += 1;
      if (eventType === "PRINT_ATTEMPTED") printAttemptCount += 1;
      if (eventType === "PAGE_CHANGED") pageChangeCount += 1;
    }
  }
  return {
    estimatedVisibleMs,
    fullscreenExitCount,
    visibilityHideCount,
    printAttemptCount,
    pageChangeCount,
    sessionCount: sessions.length,
  };
}
