import "server-only";

import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, sessionEvents, shareBatches, shares, uploadGroups, viewingSessions } from "@/lib/db/schema";
import { evaluateShareAccess } from "@/lib/shares/policy";
import type { VerifiedUser } from "@/lib/auth/current-verified-user";
import { creditVisibleInterval, observationCreditsVisibleTime } from "@/lib/activity/visible-time";

export const SESSION_MAX_LIFETIME_MS = 4 * 60 * 60 * 1000;
export const SESSION_INACTIVITY_MS = 2 * 60 * 1000;
export const SESSION_CREATE_PER_MINUTE = 10;
export const MAX_EVENTS_PER_SUBMISSION = 20;

export const SESSION_EVENT_TYPES = [
  "HEARTBEAT",
  "VISIBILITY_HIDDEN",
  "VISIBILITY_VISIBLE",
  "FULLSCREEN_ENTER",
  "FULLSCREEN_EXIT",
  "PAGE_CHANGED",
  "SCREENSHOT_ATTEMPTED",
  "PRINT_ATTEMPTED",
  "COVERED",
  "SESSION_CLOSED",
] as const;

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export type IncomingSessionEvent = {
  sequence: number;
  eventType: SessionEventType;
  marked: boolean;
  visible: boolean;
  fullscreen: boolean;
  authorized: boolean;
  pageIndex?: number | null;
};

export async function authorizeShareDocument(
  shareId: string,
  documentId: string,
  user: VerifiedUser,
) {
  const [record] = await getDb().select({
    shareStatus: shares.status,
    recipientClerkUserId: shares.recipientClerkUserId,
    recipientEmailNormalized: shares.recipientEmailNormalized,
    groupStatus: uploadGroups.status,
    availableFrom: shareBatches.availableFrom,
    expiresAt: shareBatches.expiresAt,
    documentStatus: documents.status,
  }).from(shares)
    .innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
    .innerJoin(shareBatches, eq(shareBatches.id, shares.batchId))
    .innerJoin(documents, and(eq(documents.id, documentId), eq(documents.groupId, shares.groupId)))
    .where(eq(shares.id, shareId)).limit(1);
  if (!record) return null;
  const decision = evaluateShareAccess({
    status: record.shareStatus,
    groupStatus: record.groupStatus,
    availableFrom: record.availableFrom,
    expiresAt: record.expiresAt,
    recipientClerkUserId: record.recipientClerkUserId,
    recipientEmailNormalized: record.recipientEmailNormalized,
  }, user.userId, user.verifiedEmails);
  if (decision !== "AUTHORIZED" || record.documentStatus !== "READY") return null;
  return record;
}

export async function createViewingSession(input: {
  shareId: string;
  documentId: string;
  user: VerifiedUser;
  browserFamily: string;
  platformCategory: string;
  viewportBucket: string;
  dprBucket: string;
  webgpuOutcome: string;
}) {
  const authorized = await authorizeShareDocument(input.shareId, input.documentId, input.user);
  if (!authorized) return { error: "FORBIDDEN" as const };

  const minuteAgo = new Date(Date.now() - 60_000);
  const [recent] = await getDb().select({ value: count() }).from(viewingSessions)
    .where(and(eq(viewingSessions.clerkUserId, input.user.userId), gte(viewingSessions.openedAt, minuteAgo)));
  if ((recent?.value ?? 0) >= SESSION_CREATE_PER_MINUTE) return { error: "RATE_LIMITED" as const };

  const now = new Date();
  const id = crypto.randomUUID();
  await getDb().insert(viewingSessions).values({
    id,
    shareId: input.shareId,
    documentId: input.documentId,
    clerkUserId: input.user.userId,
    status: "OPEN",
    browserFamily: input.browserFamily,
    platformCategory: input.platformCategory,
    viewportBucket: input.viewportBucket,
    dprBucket: input.dprBucket,
    webgpuOutcome: input.webgpuOutcome,
    estimatedVisibleMs: 0,
    openedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MAX_LIFETIME_MS),
    lastServerEventAt: now,
    updatedAt: now,
  });
  return { sessionId: id, expiresAt: new Date(now.getTime() + SESSION_MAX_LIFETIME_MS).toISOString() };
}

export async function appendSessionEvents(input: {
  shareId: string;
  sessionId: string;
  user: VerifiedUser;
  events: IncomingSessionEvent[];
}) {
  if (input.events.length === 0 || input.events.length > MAX_EVENTS_PER_SUBMISSION) {
    return { error: "INVALID_EVENTS" as const };
  }

  const [session] = await getDb().select().from(viewingSessions)
    .where(and(eq(viewingSessions.id, input.sessionId), eq(viewingSessions.shareId, input.shareId))).limit(1);
  if (!session || session.clerkUserId !== input.user.userId) return { error: "FORBIDDEN" as const };

  const now = new Date();
  const inactiveDeadline = session.lastServerEventAt
    ? new Date(session.lastServerEventAt.getTime() + SESSION_INACTIVITY_MS)
    : session.expiresAt;
  if (session.status !== "OPEN" || now > session.expiresAt || now > inactiveDeadline) {
    if (session.status === "OPEN") {
      await getDb().update(viewingSessions).set({
        status: "EXPIRED",
        closedAt: now,
        updatedAt: now,
      }).where(eq(viewingSessions.id, session.id));
    }
    return { error: "SESSION_EXPIRED" as const };
  }

  const authorized = await authorizeShareDocument(session.shareId, session.documentId, input.user);
  if (!authorized) return { error: "FORBIDDEN" as const };

  const sorted = [...input.events].sort((a, b) => a.sequence - b.sequence);
  let estimatedVisibleMs = session.estimatedVisibleMs;
  let lastVisibleCreditAt = session.lastVisibleCreditAt;
  let status: "OPEN" | "EXPIRED" | "CLOSED" = session.status;
  let closedAt = session.closedAt;
  const rows: Array<typeof sessionEvents.$inferInsert> = [];

  for (const event of sorted) {
    const credits = observationCreditsVisibleTime(event);
    const { creditMs, nextCreditAt } = creditVisibleInterval(lastVisibleCreditAt, now, credits);
    estimatedVisibleMs += creditMs;
    lastVisibleCreditAt = nextCreditAt;
    rows.push({
      sessionId: session.id,
      sequence: event.sequence,
      eventType: event.eventType,
      marked: event.marked ? 1 : 0,
      visible: event.visible ? 1 : 0,
      fullscreen: event.fullscreen ? 1 : 0,
      authorized: event.authorized ? 1 : 0,
      pageIndex: event.pageIndex ?? null,
      serverReceivedAt: now,
    });
    if (event.eventType === "SESSION_CLOSED") {
      status = "CLOSED";
      closedAt = now;
    }
  }

  try {
    await getDb().insert(sessionEvents).values(rows);
  } catch (error) {
    // Unique (session, sequence) collisions are treated as successful idempotent replays.
    if (isUniqueViolation(error)) {
      return {
        recorded: true,
        estimatedVisibleMs: session.estimatedVisibleMs,
        status: session.status,
        duplicate: true,
      };
    }
    throw error;
  }

  await getDb().update(viewingSessions).set({
    estimatedVisibleMs,
    lastVisibleCreditAt,
    lastServerEventAt: now,
    status,
    closedAt,
    updatedAt: now,
  }).where(eq(viewingSessions.id, session.id));

  return { recorded: true, estimatedVisibleMs, status, duplicate: false };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export async function deleteSessionsForDocuments(documentIds: string[]) {
  if (!documentIds.length) return;
  await getDb().delete(viewingSessions).where(inArray(viewingSessions.documentId, documentIds));
}
