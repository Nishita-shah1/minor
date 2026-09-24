import { and, eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { normalizeEmail } from "@/lib/auth/email";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { lookupRecipients } from "@/lib/auth/recipient-lookup";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, shareBatches, shares, uploadGroups, userKeyBundles } from "@/lib/db/schema";
import { getAppEnv } from "@/lib/server/env";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { createShares } from "@/lib/server/validators";
import { validateShareSchedule } from "@/lib/shares/schedule";

export async function POST(request: Request, context: RouteContext<"/api/upload-groups/[groupId]/shares">) {
  try {
    const user = await requireVerifiedUser();
    const groupId = requireUuid((await context.params).groupId);
    const input = createShares.parse(await request.json());
    const [group] = await getDb().select({ id: uploadGroups.id }).from(uploadGroups).where(and(
      eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId), eq(uploadGroups.status, "READY"),
    )).limit(1);
    if (!group) return json({ error: { code: "NOT_FOUND", message: "Ready upload group not found." } }, { status: 404 });
    const [existingBatch] = await getDb().select({ id: shareBatches.id }).from(shareBatches)
      .where(eq(shareBatches.groupId, groupId)).limit(1);
    if (existingBatch) return json({ error: { code: "SHARES_ALREADY_CREATED", message: "Secure links already exist for this group." } }, { status: 409 });
    const groupDocuments = await getDb().select({ id: documents.id }).from(documents)
      .where(and(eq(documents.groupId, groupId), eq(documents.status, "READY")));
    const documentIds = groupDocuments.map((document) => document.id);
    if (!documentIds.length) return json({ error: { code: "EMPTY_GROUP", message: "This group has no protected files." } }, { status: 409 });

    const availableFrom = input.availableFrom ? new Date(input.availableFrom) : null;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const scheduleError = validateShareSchedule({ availableFrom, expiresAt });
    if (scheduleError) return json({ error: { code: "INVALID_SCHEDULE", message: scheduleError } }, { status: 400 });

    const ready = input.recipients.filter((recipient) => recipient.status === "READY");
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

    const batchId = crypto.randomUUID();
    const rows = input.recipients.map((recipient) => ({
      id: crypto.randomUUID(), batchId, groupId, senderClerkUserId: user.userId,
      recipientClerkUserId: recipient.status === "READY" ? recipient.clerkUserId : null,
      recipientEmailNormalized: normalizeEmail(recipient.email), permission: input.permission,
      status: recipient.status === "READY" ? "ACTIVE" as const : "AWAITING_RECIPIENT_KEY" as const,
    }));
    const envelopes = ready.flatMap((recipient) => recipient.envelopes.map((envelope) => ({
      documentId: envelope.documentId,
      clerkUserId: recipient.clerkUserId,
      wrappedFileKey: envelope.wrappedFileKey,
      keyVersion: recipient.keyVersion,
    })));
    if (envelopes.length) {
      await getDb().batch([
        getDb().insert(shareBatches).values({ id: batchId, groupId, senderClerkUserId: user.userId, permission: input.permission, availableFrom, expiresAt }),
        getDb().insert(shares).values(rows),
        getDb().insert(documentKeyEnvelopes).values(envelopes).onConflictDoNothing(),
      ]);
    } else {
      await getDb().batch([
        getDb().insert(shareBatches).values({ id: batchId, groupId, senderClerkUserId: user.userId, permission: input.permission, availableFrom, expiresAt }),
        getDb().insert(shares).values(rows),
      ]);
    }
    const appUrl = getAppEnv().APP_URL.replace(/\/$/, "");
    return json({ batchId, shares: rows.map((row) => ({
      shareId: row.id, recipientEmail: row.recipientEmailNormalized, status: row.status,
      shareUrl: row.status === "ACTIVE" ? `${appUrl}/share/${row.id}` : null,
    })) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_REQUEST", message: "The share request is invalid." } }, { status: 400 });
    return safeRouteError(error);
  }
}
