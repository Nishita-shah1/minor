import { and, eq, inArray } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, shareBatches, shares, uploadGroups } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { evaluateShareAccess } from "@/lib/shares/policy";

export async function GET(_request: Request, context: RouteContext<"/api/shares/[shareId]/access">) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const [record] = await getDb().select({
      groupId: shares.groupId,
      shareStatus: shares.status,
      permission: shares.permission,
      recipientClerkUserId: shares.recipientClerkUserId,
      recipientEmailNormalized: shares.recipientEmailNormalized,
      groupStatus: uploadGroups.status,
      availableFrom: shareBatches.availableFrom,
      expiresAt: shareBatches.expiresAt,
    }).from(shares)
      .innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
      .innerJoin(shareBatches, eq(shareBatches.id, shares.batchId))
      .where(eq(shares.id, shareId)).limit(1);
    if (!record) return forbidden();
    const decision = evaluateShareAccess({
      status: record.shareStatus,
      groupStatus: record.groupStatus,
      availableFrom: record.availableFrom,
      expiresAt: record.expiresAt,
      recipientClerkUserId: record.recipientClerkUserId,
      recipientEmailNormalized: record.recipientEmailNormalized,
    }, user.userId, user.verifiedEmails);
    if (decision === "FORBIDDEN") return forbidden();
    if (decision === "DELETED") return json({ error: { code: "SHARE_DELETED", message: "This protected share was deleted by its owner." } }, { status: 410 });
    if (decision === "NOT_YET_AVAILABLE") return json({ error: { code: decision, message: "This protected share is not open yet.", availableFrom: record.availableFrom?.toISOString() } }, { status: 403 });
    if (decision === "EXPIRED") return json({ error: { code: decision, message: "This protected share has expired." } }, { status: 403 });
    if (decision !== "AUTHORIZED") return json({ error: { code: "REVOKED", message: "This protected share is no longer available." } }, { status: 403 });

    const documentRows = await getDb().select({
      documentId: documents.id,
      status: documents.status,
      encryptedMetadata: documents.encryptedMetadata,
      metadataIv: documents.metadataIv,
      wrappedFileKey: documentKeyEnvelopes.wrappedFileKey,
    }).from(documents).leftJoin(documentKeyEnvelopes, and(
      eq(documentKeyEnvelopes.documentId, documents.id),
      eq(documentKeyEnvelopes.clerkUserId, user.userId),
    )).where(and(eq(documents.groupId, record.groupId), inArray(documents.status, ["READY", "DELETED"])));
    return json({
      groupId: record.groupId,
      permission: record.permission,
      availableFrom: record.availableFrom?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      documents: documentRows.map((document) => ({ ...document, status: document.status === "READY" ? "READY" : "DELETED" })),
    });
  } catch (error) {
    return safeRouteError(error);
  }
}

function forbidden() {
  return json({ error: { code: "FORBIDDEN", message: "This account is not authorized for this protected share." } }, { status: 403 });
}
