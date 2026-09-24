import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, shareBatches, shares, uploadGroups } from "@/lib/db/schema";
import { presignEncryptedDownload } from "@/lib/r2/objects";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { evaluateShareAccess } from "@/lib/shares/policy";

export async function GET(_request: Request, context: RouteContext<"/api/shares/[shareId]/documents/[documentId]/access">) {
  try {
    const user = await requireVerifiedUser();
    const params = await context.params;
    const shareId = requireUuid(params.shareId);
    const documentId = requireUuid(params.documentId);
    const [record] = await getDb().select({
      shareStatus: shares.status,
      recipientClerkUserId: shares.recipientClerkUserId,
      recipientEmailNormalized: shares.recipientEmailNormalized,
      groupStatus: uploadGroups.status,
      availableFrom: shareBatches.availableFrom,
      expiresAt: shareBatches.expiresAt,
      documentStatus: documents.status,
      objectKey: documents.r2ObjectKey,
      fileIv: documents.fileIv,
      wrappedFileKey: documentKeyEnvelopes.wrappedFileKey,
    }).from(shares)
      .innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
      .innerJoin(shareBatches, eq(shareBatches.id, shares.batchId))
      .innerJoin(documents, and(eq(documents.id, documentId), eq(documents.groupId, shares.groupId)))
      .innerJoin(documentKeyEnvelopes, and(eq(documentKeyEnvelopes.documentId, documentId), eq(documentKeyEnvelopes.clerkUserId, user.userId)))
      .where(eq(shares.id, shareId)).limit(1);
    if (!record) return forbidden();
    const decision = evaluateShareAccess({
      status: record.shareStatus, groupStatus: record.groupStatus, availableFrom: record.availableFrom,
      expiresAt: record.expiresAt, recipientClerkUserId: record.recipientClerkUserId,
      recipientEmailNormalized: record.recipientEmailNormalized,
    }, user.userId, user.verifiedEmails);
    if (decision !== "AUTHORIZED" || record.documentStatus !== "READY" || !record.objectKey || !record.fileIv) return forbidden();
    return json({ documentId, downloadUrl: await presignEncryptedDownload(record.objectKey), wrappedFileKey: record.wrappedFileKey, fileIv: record.fileIv });
  } catch (error) {
    return safeRouteError(error);
  }
}

function forbidden() {
  return json({ error: { code: "FORBIDDEN", message: "This file is not available." } }, { status: 403 });
}
