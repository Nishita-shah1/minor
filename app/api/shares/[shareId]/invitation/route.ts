import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documents, invitationGrants, shareBatches, shares, uploadGroups } from "@/lib/db/schema";
import { ISSUED_PROFILE, TRUSTMARK_PROFILE } from "@/lib/fingerprint/profile";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";

const grantInput = z.object({
  ciphertext: z.string().min(20).max(15_000), iv: z.string().min(12).max(40).regex(/^[A-Za-z0-9_-]+$/),
  proof: z.string().min(40).max(60).regex(/^[A-Za-z0-9_-]+$/),
  ownerWrappedSecret: z.string().min(300).max(1_000).regex(/^[A-Za-z0-9_-]+$/),
  fingerprints: z.array(z.object({ documentId: z.uuid(), ownerWrappedKey: z.string().min(300).max(1_000).regex(/^[A-Za-z0-9_-]+$/), profileId: z.enum([TRUSTMARK_PROFILE, ISSUED_PROFILE]) })).min(1).max(10),
});

type Context = { params: Promise<{ shareId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const [row] = await getDb().select({ shareStatus: shares.status, email: shares.recipientEmailNormalized, groupStatus: uploadGroups.status,
      expiresAt: shareBatches.expiresAt,
      ciphertext: invitationGrants.ciphertext, iv: invitationGrants.iv })
      .from(shares).innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
      .innerJoin(shareBatches, eq(shareBatches.id, shares.batchId))
      .innerJoin(invitationGrants, eq(invitationGrants.shareId, shares.id))
      .where(eq(shares.id, shareId)).limit(1);
    if (!row || row.shareStatus !== "AWAITING_RECIPIENT_KEY" || row.groupStatus !== "READY" ||
      (row.expiresAt && row.expiresAt <= new Date()) || !user.verifiedEmails.includes(row.email))
      return json({ error: { code: "FORBIDDEN", message: "This invitation is not available to this verified account." } }, { status: 403 });
    return json({ ciphertext: row.ciphertext, iv: row.iv });
  } catch (error) { return safeRouteError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    if (!experimentalFingerprintingEnabled()) return json({ error: { code: "NOT_ENABLED", message: "Protected invitations are unavailable on this server." } }, { status: 409 });
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const input = grantInput.safeParse(await request.json());
    if (!input.success) return json({ error: { code: "INVALID_GRANT", message: "Invitation grant is invalid." } }, { status: 400 });
    const [share] = await getDb().select({ status: shares.status, ownerId: shares.senderClerkUserId, groupId: shares.groupId,
      groupStatus: uploadGroups.status }).from(shares).innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId)).where(eq(shares.id, shareId)).limit(1);
    if (!share || share.ownerId !== user.userId || share.groupStatus !== "READY" || share.status !== "AWAITING_RECIPIENT_KEY")
      return json({ error: { code: "NOT_FOUND", message: "Waiting share not found." } }, { status: 404 });
    const docs = await getDb().select({ id: documents.id }).from(documents).where(and(eq(documents.groupId, share.groupId), eq(documents.status, "READY")));
    const expected = new Set(docs.map(doc => doc.id));
    if (expected.size !== input.data.fingerprints.length || new Set(input.data.fingerprints.map(item => item.documentId)).size !== expected.size || input.data.fingerprints.some(item => !expected.has(item.documentId)))
      return json({ error: { code: "INCOMPLETE_GRANT", message: "The grant must cover every ready document." } }, { status: 400 });
    const inserted = await getDb().execute(sql`INSERT INTO invitation_grants (share_id, ciphertext, iv, proof, owner_wrapped_secret, fingerprints)
      SELECT ${shareId}::uuid, ${input.data.ciphertext}, ${input.data.iv}, ${input.data.proof}, ${input.data.ownerWrappedSecret}, ${JSON.stringify(input.data.fingerprints)}::jsonb
      WHERE EXISTS (SELECT 1 FROM shares s JOIN upload_groups g ON g.id = s.group_id WHERE s.id = ${shareId}::uuid AND s.sender_clerk_user_id = ${user.userId} AND s.status = 'AWAITING_RECIPIENT_KEY' AND g.status = 'READY')
      ON CONFLICT (share_id) DO NOTHING RETURNING share_id`);
    const [saved] = await getDb().select({ proof: invitationGrants.proof }).from(invitationGrants).where(eq(invitationGrants.shareId, shareId)).limit(1);
    if (!saved || saved.proof !== input.data.proof) return json({ error: { code: "GRANT_CONFLICT", message: "This share already has a different invitation. Reload its link." } }, { status: 409 });
    if (inserted.rows.length) await getDb().update(shares).set({ emailStatus: "NOT_REQUESTED", emailAttemptId: null, providerMessageId: null })
      .where(eq(shares.id, shareId));
    return json({ ready: true });
  } catch (error) { return safeRouteError(error); }
}
