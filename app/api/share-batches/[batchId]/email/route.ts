import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { shareBatches, shares } from "@/lib/db/schema";
import { sendShareEmailBatch } from "@/lib/email/brevo";
import { getAppEnv } from "@/lib/server/env";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const batchId = requireUuid((await context.params).batchId);
    const [batch] = await getDb().select().from(shareBatches).where(and(
      eq(shareBatches.id, batchId), eq(shareBatches.senderClerkUserId, user.userId),
    )).limit(1);
    if (!batch) return json({ error: { code: "NOT_FOUND", message: "Share batch not found." } }, { status: 404 });
    if (batch.emailStatus === "ACCEPTED") return json({ status: "ACCEPTED" });

    const shareRows = await getDb().select().from(shares).where(and(
      eq(shares.batchId, batchId), eq(shares.status, "ACTIVE"),
    ));
    if (!shareRows.length) return json({ error: { code: "NO_ACTIVE_RECIPIENTS", message: "No enrolled recipients can be emailed." } }, { status: 409 });
    const attemptId = batch.emailAttemptId ?? batchId;
    await getDb().update(shareBatches).set({
      emailStatus: "SENDING", emailAttemptId: attemptId, updatedAt: new Date(),
    }).where(eq(shareBatches.id, batchId));
    const appUrl = getAppEnv().APP_URL.replace(/\/$/, "");
    try {
      const messageIds = await sendShareEmailBatch(shareRows.map((share) => ({
        recipientEmail: share.recipientEmailNormalized,
        shareUrl: `${appUrl}/share/${share.id}`,
        availableFrom: batch.availableFrom,
        expiresAt: batch.expiresAt,
      })), attemptId, user.primaryEmail);
      await Promise.all(shareRows.map((share, index) => getDb().update(shares).set({
        providerMessageId: messageIds[index] ?? null,
      }).where(eq(shares.id, share.id))));
      await getDb().update(shareBatches).set({ emailStatus: "ACCEPTED", updatedAt: new Date() }).where(eq(shareBatches.id, batchId));
      return json({ status: "ACCEPTED", message: "Email request accepted." });
    } catch (error) {
      await getDb().update(shareBatches).set({ emailStatus: "FAILED", updatedAt: new Date() }).where(and(
        eq(shareBatches.id, batchId),
        eq(shareBatches.emailStatus, "SENDING"),
      ));
      throw error;
    }
  } catch (error) {
    return safeRouteError(error);
  }
}
