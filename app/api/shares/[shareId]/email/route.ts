import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { invitationGrants, shareBatches, shares, uploadGroups } from "@/lib/db/schema";
import { sendShareEmailBatch } from "@/lib/email/brevo";
import { getAppEnv } from "@/lib/server/env";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { invitationProof } from "@/lib/shares/invitation-proof";

const bodySchema = z.object({ attemptId: z.uuid(), invitationUrl: z.string().url().max(2_000).optional(), resend: z.boolean().optional() });

export async function POST(request: Request, context: { params: Promise<{ shareId: string }> }) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: { code: "INVALID_REQUEST", message: "Email request is invalid." } }, { status: 400 });
    const input = parsed.data;
    const [record] = await getDb().select({ share: shares, batch: shareBatches, groupStatus: uploadGroups.status,
      grantShareId: invitationGrants.shareId, grantProof: invitationGrants.proof })
      .from(shares).innerJoin(shareBatches, eq(shareBatches.id, shares.batchId))
      .innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
      .leftJoin(invitationGrants, eq(invitationGrants.shareId, shares.id))
      .where(eq(shares.id, shareId)).limit(1);
    if (!record || record.share.senderClerkUserId !== user.userId) return json({ error: { code: "NOT_FOUND", message: "Share not found." } }, { status: 404 });
    if (record.groupStatus !== "READY" || (record.batch.expiresAt && record.batch.expiresAt <= new Date()) ||
      !["ACTIVE", "AWAITING_RECIPIENT_KEY"].includes(record.share.status))
      return json({ error: { code: "UNAVAILABLE", message: "This share cannot be emailed." } }, { status: 409 });
    if (record.share.emailStatus === "ACCEPTED" && !input.resend) return json({ status: "ACCEPTED", message: "This invitation was already accepted by Brevo." });
    const base = getAppEnv().APP_URL.replace(/\/$/, "");
    let shareUrl = `${base}/share/${shareId}`;
    if (record.share.status === "AWAITING_RECIPIENT_KEY") {
      if (!record.grantShareId || !input.invitationUrl) return json({ error: { code: "GRANT_REQUIRED", message: "Prepare the encrypted invitation before sending." } }, { status: 409 });
      const url = new URL(input.invitationUrl);
      const origin = new URL(base);
      if (url.origin !== origin.origin || url.pathname !== `${origin.pathname.replace(/\/$/, "")}/share/${shareId}` ||
        !/^#invite=[A-Za-z0-9_-]{43}$/.test(url.hash) || url.search)
        return json({ error: { code: "INVALID_INVITE_LINK", message: "Invitation link is invalid." } }, { status: 400 });
      if (await invitationProof(url.hash.slice("#invite=".length)) !== record.grantProof)
        return json({ error: { code: "INVALID_INVITE_LINK", message: "This link does not match the saved invitation." } }, { status: 400 });
      shareUrl = url.toString();
    }
    const attempt = input.attemptId;
    const [claimed] = await getDb().update(shares).set({ emailStatus: "SENDING", emailAttemptId: attempt, emailUpdatedAt: new Date() })
      .where(and(eq(shares.id, shareId), sql`EXISTS (SELECT 1 FROM upload_groups WHERE id = ${record.share.groupId}::uuid AND status = 'READY')`,
        or(ne(shares.emailStatus, "SENDING"), and(eq(shares.emailAttemptId, attempt), lt(shares.emailUpdatedAt, new Date(Date.now() - 5 * 60_000)))),
        input.resend ? undefined : ne(shares.emailStatus, "ACCEPTED")))
      .returning({ id: shares.id });
    if (!claimed) return json({ error: { code: "EMAIL_BUSY", message: "An email attempt is already processing. Retry shortly." } }, { status: 409 });
    try {
      const ids = await sendShareEmailBatch([{ recipientEmail: record.share.recipientEmailNormalized, shareUrl,
        availableFrom: record.batch.availableFrom, expiresAt: record.batch.expiresAt }], attempt, user.primaryEmail);
      await getDb().update(shares).set({ emailStatus: "ACCEPTED", emailUpdatedAt: new Date(), providerMessageId: ids[0] })
        .where(and(eq(shares.id, shareId), eq(shares.emailAttemptId, attempt)));
      return json({ status: "ACCEPTED", message: "Brevo accepted the invitation. Delivery is not confirmed." });
    } catch {
      await getDb().update(shares).set({ emailStatus: "FAILED", emailUpdatedAt: new Date() })
        .where(and(eq(shares.id, shareId), eq(shares.emailAttemptId, attempt)));
      return json({ error: { code: "EMAIL_FAILED", message: "Brevo did not accept this invitation. Retry this recipient." } }, { status: 502 });
    }
  } catch (error) { return safeRouteError(error); }
}
