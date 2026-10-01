import { and, eq, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { normalizeEmail } from "@/lib/auth/email";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { lookupRecipients } from "@/lib/auth/recipient-lookup";
import { getDb } from "@/lib/db";
import { documents, invitationGrants, shareBatches, shares, uploadGroups, userKeyBundles } from "@/lib/db/schema";
import { getAppEnv } from "@/lib/server/env";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { createShares } from "@/lib/server/validators";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";
import { appendRecipientsSql } from "@/lib/shares/persist";
import { validateShareSchedule } from "@/lib/shares/schedule";

export async function POST(request: Request, context: RouteContext<"/api/upload-groups/[groupId]/shares">) {
  try {
    const user = await requireVerifiedUser();
    const groupId = requireUuid((await context.params).groupId);
    const input = createShares.parse(await request.json());
    if (input.permission !== "VIEW_ONLY") return json({ error: { code: "VIEW_ONLY_REQUIRED", message: "New protected links must be view-only." } }, { status: 400 });
    const [group] = await getDb().select({ id: uploadGroups.id }).from(uploadGroups).where(and(
      eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId), eq(uploadGroups.status, "READY"),
    )).limit(1);
    if (!group) return json({ error: { code: "NOT_FOUND", message: "Ready upload group not found." } }, { status: 404 });
    const [existingBatch] = await getDb().select().from(shareBatches).where(eq(shareBatches.groupId, groupId)).limit(1);
    const normalized = input.recipients.map(recipient => normalizeEmail(recipient.email));
    if (new Set(normalized).size !== normalized.length) return json({ error: { code: "DUPLICATE_EMAIL", message: "Use each recipient email once." } }, { status: 400 });
    const groupDocuments = await getDb().select({ id: documents.id }).from(documents)
      .where(and(eq(documents.groupId, groupId), eq(documents.status, "READY")));
    const documentIds = groupDocuments.map((document) => document.id);
    if (!documentIds.length) return json({ error: { code: "EMPTY_GROUP", message: "This group has no protected files." } }, { status: 409 });

    const availableFrom = input.availableFrom ? new Date(input.availableFrom) : null;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const scheduleError = validateShareSchedule({ availableFrom, expiresAt });
    if (!existingBatch && scheduleError) return json({ error: { code: "INVALID_SCHEDULE", message: scheduleError } }, { status: 400 });

    const ready = input.recipients.filter((recipient) => recipient.status === "READY");
    const fingerprintsEnabled = experimentalFingerprintingEnabled();
    if (fingerprintsEnabled && ready.some(recipient => recipient.envelopes.some(envelope => !envelope.fingerprint))) return json({ error: { code: "FINGERPRINT_REQUIRED", message: "Prepare links again to create encrypted copy fingerprints." } }, { status: 409 });
    const userIds = ready.map((recipient) => recipient.clerkUserId);
    if (new Set(userIds).size !== userIds.length) return json({ error: { code: "DUPLICATE_ACCOUNT", message: "Use one verified address per recipient account." } }, { status: 400 });
    const everyEnvelopePresent = ready.every((recipient) => {
      const ids = recipient.envelopes.map((envelope) => envelope.documentId);
      return ids.length === documentIds.length && new Set(ids).size === ids.length && documentIds.every((id) => ids.includes(id));
    });
    if (!everyEnvelopePresent) return json({ error: { code: "INCOMPLETE_ENVELOPES", message: "Every recipient needs a key envelope for every file." } }, { status: 400 });

    const liveRecipients = await lookupRecipients(input.recipients.map((recipient) => recipient.email));
    const liveByEmail = new Map(liveRecipients.map((recipient) => [recipient.email, recipient]));
    if (ready.some((recipient) => {
      const live = liveByEmail.get(normalizeEmail(recipient.email));
      return live?.status !== "READY" || live.clerkUserId !== recipient.clerkUserId;
    })) return json({ error: { code: "RECIPIENT_IDENTITY_CHANGED", message: "A recipient changed. Prepare again." } }, { status: 409 });

    const bundles = userIds.length ? await getDb().select().from(userKeyBundles).where(inArray(userKeyBundles.clerkUserId, userIds)) : [];
    const bundleByUser = new Map(bundles.map((bundle) => [bundle.clerkUserId, bundle]));
    if (ready.some((recipient) => {
      const bundle = bundleByUser.get(recipient.clerkUserId);
      return !bundle || bundle.keyVersion !== recipient.keyVersion || bundle.publicKeyFingerprint !== recipient.publicKeyFingerprint;
    })) return json({ error: { code: "RECIPIENT_KEY_CHANGED", message: "A recipient key changed. Prepare again." } }, { status: 409 });

    const db = getDb();
    const recipients = input.recipients.map(recipient => ({
      recipientName: liveByEmail.get(normalizeEmail(recipient.email))?.recipientName ?? null,
      id: crypto.randomUUID(), email: normalizeEmail(recipient.email),
      userId: recipient.status === "READY" ? recipient.clerkUserId : null,
      status: recipient.status === "READY" ? "ACTIVE" : "AWAITING_RECIPIENT_KEY",
      keyVersion: recipient.status === "READY" ? recipient.keyVersion : null,
      envelopes: recipient.status === "READY" ? recipient.envelopes : [],
    }));
    const results = await db.batch([
      db.select({ id: uploadGroups.id }).from(uploadGroups).where(and(eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId))).for("update"),
      db.execute(sql`INSERT INTO share_batches (id, group_id, sender_clerk_user_id, permission, available_from, expires_at)
        SELECT ${crypto.randomUUID()}::uuid, id, owner_clerk_user_id, ${input.permission}::share_permission, ${availableFrom?.toISOString() ?? null}::timestamptz, ${expiresAt?.toISOString() ?? null}::timestamptz
        FROM upload_groups WHERE id = ${groupId}::uuid AND owner_clerk_user_id = ${user.userId} AND status = 'READY'
        ON CONFLICT (group_id) DO NOTHING`),
      db.execute(appendRecipientsSql(groupId, user.userId, recipients, fingerprintsEnabled)),
    ]);
    const outcome = results[2].rows[0] as { allowed: boolean; available: boolean; emailing: boolean };
    if (!outcome.available) return json({ error: { code: "NOT_FOUND", message: "Ready upload group not found." } }, { status: 404 });
    if (outcome.emailing) return json({ error: { code: "EMAIL_IN_PROGRESS", message: "An email request is in progress. Retry adding recipients shortly." } }, { status: 409 });
    if (!outcome.allowed) return json({ error: { code: "RECIPIENT_LIMIT", message: "This group can have at most 100 recipients, including existing links." } }, { status: 409 });
    return json(await loadLinks(groupId), { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_REQUEST", message: "The share request is invalid." } }, { status: 400 });
    return safeRouteError(error);
  }
}

async function loadLinks(groupId: string) {
  const [batch] = await getDb().select().from(shareBatches).where(eq(shareBatches.groupId, groupId)).limit(1);
  if (!batch) return { batchId: null, shares: [] };
  const rows = await getDb().select({ share: shares, ownerWrappedInviteSecret: invitationGrants.ownerWrappedSecret })
    .from(shares).leftJoin(invitationGrants, eq(invitationGrants.shareId, shares.id)).where(eq(shares.batchId, batch.id));
  const appUrl = getAppEnv().APP_URL.replace(/\/$/, "");
  return { batchId: batch.id, emailAttemptId: batch.emailStatus === "SENDING" || batch.emailStatus === "FAILED" ? batch.emailAttemptId : null, permission: batch.permission, availableFrom: batch.availableFrom, expiresAt: batch.expiresAt,
    shares: rows.map(({share, ownerWrappedInviteSecret}) => ({ shareId: share.id, recipientEmail: share.recipientEmailNormalized,
      status: share.status, emailStatus: share.emailStatus, emailAttemptId: share.emailAttemptId,
      ownerWrappedInviteSecret: share.status === "AWAITING_RECIPIENT_KEY" ? ownerWrappedInviteSecret : null,
      shareBaseUrl: `${appUrl}/share/${share.id}`,
      shareUrl: share.status === "ACTIVE" ? `${appUrl}/share/${share.id}` : null })) };
}

export async function GET(_request: Request, context: RouteContext<"/api/upload-groups/[groupId]/shares">) {
  try {
    const user = await requireVerifiedUser();
    const groupId = requireUuid((await context.params).groupId);
    const [group] = await getDb().select({ id: uploadGroups.id }).from(uploadGroups).where(and(eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId), eq(uploadGroups.status, "READY"))).limit(1);
    if (!group) return json({ error: { code: "NOT_FOUND", message: "Ready upload group not found." } }, { status: 404 });
    return json(await loadLinks(groupId));
  } catch (error) { return safeRouteError(error); }
}
