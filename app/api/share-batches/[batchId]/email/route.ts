import { and, eq, or, ne, lt, isNull, sql } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { shareBatches, shares, uploadGroups } from "@/lib/db/schema";
import { sendShareEmailBatch } from "@/lib/email/brevo";
import { publishedOpenPgpKeys } from "@/lib/openpgp/published-keys";
import { getAppEnv } from "@/lib/server/env";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const batchId = requireUuid((await context.params).batchId);
    const [batch] = await getDb().select().from(shareBatches).where(and(
      eq(shareBatches.id, batchId), eq(shareBatches.senderClerkUserId, user.userId),
    )).limit(1);
    if (!batch) return json({ error: { code: "NOT_FOUND", message: "Share batch not found." } }, { status: 404 });
    const body = await request.text();
    let attemptId: string;
    try { attemptId = body ? requireUuid(JSON.parse(body).attemptId) : batch.emailAttemptId ?? batch.id; }
    catch { return json({ error: { code: "INVALID_REQUEST", message: "A valid email attempt identifier is required." } }, { status: 400 }); }
    if (batch.emailStatus === "ACCEPTED" && batch.emailAttemptId === attemptId) return json({ status: "ACCEPTED" });
    if (batch.expiresAt && batch.expiresAt <= new Date()) return json({ error: { code: "EXPIRED", message: "These links have expired." } }, { status: 409 });

    const db = getDb();
    const [, claimed, shareRows] = await db.batch([
      db.select({ id: uploadGroups.id }).from(uploadGroups).where(eq(uploadGroups.id, batch.groupId)).for("update"),
      db.update(shareBatches).set({ emailStatus: "SENDING", emailAttemptId: attemptId, updatedAt: new Date() }).where(and(
        eq(shareBatches.id, batchId),
        sql`EXISTS (SELECT 1 FROM upload_groups WHERE id = ${batch.groupId}::uuid AND status = 'READY')`,
        or(ne(shareBatches.emailStatus, "SENDING"), and(eq(shareBatches.emailAttemptId, attemptId), lt(shareBatches.updatedAt, new Date(Date.now() - 5 * 60_000)))),
        // Retried accepted attempts never produce another provider request.
        or(ne(shareBatches.emailStatus, "ACCEPTED"), ne(shareBatches.emailAttemptId, attemptId), isNull(shareBatches.emailAttemptId)),
      )).returning({ id: shareBatches.id }),
      db.select().from(shares).where(and(eq(shares.batchId, batchId), eq(shares.status, "ACTIVE"))),
    ]);
    if (!claimed.length) return json({ error: { code: "EMAIL_BUSY_OR_COMPLETE", message: "This email attempt is already accepted or still processing. Your links remain available." } }, { status: 409 });
    if (!shareRows.length) {
      await db.update(shareBatches).set({ emailStatus: "FAILED", updatedAt: new Date() }).where(and(eq(shareBatches.id, batchId), eq(shareBatches.emailAttemptId, attemptId)));
      return json({ error: { code: "NO_ACTIVE_RECIPIENTS", message: "No enrolled recipients can be emailed." } }, { status: 409 });
    }
    const appUrl = getAppEnv().APP_URL.replace(/\/$/, "");
    try {
      const keys = await publishedOpenPgpKeys(shareRows.map((share) => share.recipientEmailNormalized));
      if (keys.size) {
        await getDb().update(shareBatches).set({ emailStatus: "FAILED", updatedAt: new Date() }).where(and(
          eq(shareBatches.id, batchId), eq(shareBatches.emailAttemptId, attemptId),
        ));
        return json({ error: { code: "OPENPGP_REQUIRED", message: "Send these invitations from the share panel so the browser can encrypt them to the published OpenPGP key." } }, { status: 409 });
      }
      const messageIds = await sendShareEmailBatch(shareRows.map((share) => ({
        recipientEmail: share.recipientEmailNormalized,
        shareUrl: `${appUrl}/share/${share.id}`,
        availableFrom: batch.availableFrom,
        expiresAt: batch.expiresAt,
      })), attemptId, user.primaryEmail);
      await Promise.all(shareRows.map((share, index) => getDb().update(shares).set({
        providerMessageId: messageIds[index] ?? null,
      }).where(eq(shares.id, share.id))));
      await getDb().update(shareBatches).set({ emailStatus: "ACCEPTED", updatedAt: new Date() }).where(and(eq(shareBatches.id, batchId), eq(shareBatches.emailAttemptId, attemptId)));
      return json({ status: "ACCEPTED", message: "Email request accepted." });
    } catch (error) {
      await getDb().update(shareBatches).set({ emailStatus: "FAILED", updatedAt: new Date() }).where(and(
        eq(shareBatches.id, batchId),
        eq(shareBatches.emailStatus, "SENDING"),
        eq(shareBatches.emailAttemptId, attemptId),
      ));
      throw error;
    }
  } catch (error) {
    return safeRouteError(error);
  }
}
