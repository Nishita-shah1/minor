import { clerkClient } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documents, invitationGrants, shareBatches, shares, uploadGroups, userKeyBundles } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { activateInvitationSql } from "@/lib/shares/claim-sql";

const requestSchema = z.object({
  proof: z.string().min(40).max(60).regex(/^[A-Za-z0-9_-]+$/),
  publicKeyFingerprint: z.string().length(64).regex(/^[a-f0-9]+$/),
  keyVersion: z.number().int().positive(),
  envelopes: z.array(z.object({ documentId: z.uuid(), wrappedFileKey: z.string().min(300).max(1_000).regex(/^[A-Za-z0-9_-]+$/),
    recipientWrappedKey: z.string().min(300).max(1_000).regex(/^[A-Za-z0-9_-]+$/) })).min(1).max(10),
});

export async function POST(request: Request, context: { params: Promise<{ shareId: string }> }) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: { code: "INVALID_CLAIM", message: "The invitation claim is incomplete." } }, { status: 400 });
    const input = parsed.data;
    const [share] = await getDb().select({ status: shares.status, groupId: shares.groupId, recipientId: shares.recipientClerkUserId,
      email: shares.recipientEmailNormalized, groupStatus: uploadGroups.status, expiresAt: shareBatches.expiresAt,
      proof: invitationGrants.proof, fingerprints: invitationGrants.fingerprints })
      .from(shares).innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
      .innerJoin(shareBatches, eq(shareBatches.id, shares.batchId))
      .leftJoin(invitationGrants, eq(invitationGrants.shareId, shares.id))
      .where(eq(shares.id, shareId)).limit(1);
    if (!share || !user.verifiedEmails.includes(share.email)) return json({ error: { code: "FORBIDDEN", message: "This account is not authorized for this invitation." } }, { status: 403 });
    if (share.status === "ACTIVE" && share.recipientId === user.userId) return json({ status: "ACTIVE" });
    if (share.status !== "AWAITING_RECIPIENT_KEY" || share.groupStatus !== "READY" || (share.expiresAt && share.expiresAt <= new Date()))
      return json({ error: { code: "UNAVAILABLE", message: "This invitation is no longer available." } }, { status: 409 });
    if (!share.proof || share.proof !== input.proof || !share.fingerprints) return json({ error: { code: "INVALID_SECRET", message: "The invitation code is invalid." } }, { status: 403 });
    const [bundle] = await getDb().select({ fingerprint: userKeyBundles.publicKeyFingerprint, keyVersion: userKeyBundles.keyVersion })
      .from(userKeyBundles).where(eq(userKeyBundles.clerkUserId, user.userId)).limit(1);
    if (!bundle || bundle.fingerprint !== input.publicKeyFingerprint || bundle.keyVersion !== input.keyVersion)
      return json({ error: { code: "KEY_CHANGED", message: "Set up or refresh your encryption key." } }, { status: 409 });
    const docs = await getDb().select({ id: documents.id }).from(documents).where(and(eq(documents.groupId, share.groupId), eq(documents.status, "READY")));
    const expected = new Set(docs.map(doc => doc.id));
    if (expected.size !== input.envelopes.length || expected.size !== share.fingerprints.length ||
      new Set(input.envelopes.map(item => item.documentId)).size !== expected.size || input.envelopes.some(item => !expected.has(item.documentId)) ||
      new Set(share.fingerprints.map(item => item.documentId)).size !== expected.size || share.fingerprints.some(item => !expected.has(item.documentId)))
      return json({ error: { code: "INCOMPLETE_CLAIM", message: "The invitation must cover every ready file." } }, { status: 400 });
    const clerk = await clerkClient();
    const recipient = await clerk.users.getUser(user.userId);
    const name = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim() || recipient.username || null;
    const result = await getDb().execute(activateInvitationSql({ shareId, groupId: share.groupId, email: share.email, userId: user.userId, name,
      proof: input.proof, fingerprint: input.publicKeyFingerprint, keyVersion: input.keyVersion, envelopes: input.envelopes }));
    const row = result.rows[0] as { activated: number; envelopes: number; fingerprints: number; removed_grant: number } | undefined;
    if (row?.activated !== 1) return json({ error: { code: "CLAIM_CONFLICT", message: "This invitation was already claimed or is no longer available." } }, { status: 409 });
    if (row.envelopes !== expected.size || row.fingerprints !== expected.size || row.removed_grant !== 1)
      throw new Error("Invitation claim did not produce all encrypted records.");
    return json({ status: "ACTIVE" });
  } catch (error) { return safeRouteError(error); }
}
