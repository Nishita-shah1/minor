import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, sessionEvents, shares, uploadGroups, viewingSessions } from "@/lib/db/schema";
import { EXPOSURE_RISK_DISCLAIMER } from "@/lib/activity/exposure-risk";
import type { DocumentRef, SessionActivity } from "@/lib/activity/dashboard-metrics";

export async function loadOwnerExposureRisk(ownerClerkUserId: string) {
  const ownedDocuments = await getDb().select({
    documentId: documents.id,
    groupId: documents.groupId,
    documentStatus: documents.status,
    documentCreatedAt: documents.createdAt,
    groupStatus: uploadGroups.status,
  }).from(documents)
    .innerJoin(uploadGroups, eq(uploadGroups.id, documents.groupId))
    .where(and(
      eq(documents.ownerClerkUserId, ownerClerkUserId),
      ne(documents.status, "DELETED"),
      ne(uploadGroups.status, "DELETED"),
    ));

  if (!ownedDocuments.length) {
    return { documents: [] as DocumentRef[], sessions: [] as SessionActivity[], disclaimer: EXPOSURE_RISK_DISCLAIMER };
  }

  const documentIds = ownedDocuments.map((row) => row.documentId);
  const sessionRows = await getDb().select({
    id: viewingSessions.id,
    documentId: viewingSessions.documentId,
    shareId: viewingSessions.shareId,
    estimatedVisibleMs: viewingSessions.estimatedVisibleMs,
    openedAt: viewingSessions.openedAt,
  }).from(viewingSessions).where(inArray(viewingSessions.documentId, documentIds));

  const sessionIds = sessionRows.map((session) => session.id);
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

  const counts = new Map<string, Pick<SessionActivity, "screenshotAttemptCount" | "printAttemptCount" | "visibilityHideCount" | "fullscreenExitCount" | "pageChangeCount">>();
  for (const session of sessionRows) {
    counts.set(session.id, {
      screenshotAttemptCount: 0,
      printAttemptCount: 0,
      visibilityHideCount: 0,
      fullscreenExitCount: 0,
      pageChangeCount: 0,
    });
  }
  for (const event of events) {
    const bucket = counts.get(event.sessionId);
    if (!bucket) continue;
    if (event.eventType === "SCREENSHOT_ATTEMPTED") bucket.screenshotAttemptCount += 1;
    else if (event.eventType === "PRINT_ATTEMPTED") bucket.printAttemptCount += 1;
    else if (event.eventType === "VISIBILITY_HIDDEN") bucket.visibilityHideCount += 1;
    else if (event.eventType === "FULLSCREEN_EXIT") bucket.fullscreenExitCount += 1;
    else if (event.eventType === "PAGE_CHANGED") bucket.pageChangeCount += 1;
  }

  const documentsOut: DocumentRef[] = ownedDocuments.map((document) => ({
    documentId: document.documentId,
    groupId: document.groupId,
    documentStatus: document.documentStatus,
    groupStatus: document.groupStatus,
    documentCreatedAt: document.documentCreatedAt.toISOString(),
    recipients: shareRows
      .filter((share) => share.groupId === document.groupId && share.status !== "DELETED")
      .map((share) => ({
        shareId: share.id,
        recipientName: share.recipientName,
        recipientEmail: share.recipientEmailNormalized,
        shareStatus: share.status,
        sharedAt: share.createdAt.toISOString(),
      })),
  })).sort((a, b) => b.documentCreatedAt.localeCompare(a.documentCreatedAt));

  const sessions: SessionActivity[] = sessionRows.map((session) => ({
    id: session.id,
    documentId: session.documentId,
    shareId: session.shareId,
    openedAt: session.openedAt.toISOString(),
    estimatedVisibleMs: session.estimatedVisibleMs,
    ...(counts.get(session.id) ?? {
      screenshotAttemptCount: 0,
      printAttemptCount: 0,
      visibilityHideCount: 0,
      fullscreenExitCount: 0,
      pageChangeCount: 0,
    }),
  }));

  return { documents: documentsOut, sessions, disclaimer: EXPOSURE_RISK_DISCLAIMER };
}
