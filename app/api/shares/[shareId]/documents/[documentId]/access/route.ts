import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, shareBatches, shares, uploadGroups, copyFingerprints } from "@/lib/db/schema";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";
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
    if (!experimentalFingerprintingEnabled()) return json({error:{code:"FINGERPRINTING_DISABLED",message:"Protected viewing is not enabled on this server. No unmarked content can be displayed."}},{status:503});
    let fingerprint: { recipientWrappedKey: string; profileId: string } | undefined;
    if (experimentalFingerprintingEnabled()) {
      [fingerprint] = await getDb().select({ recipientWrappedKey: copyFingerprints.recipientWrappedKey, profileId: copyFingerprints.profileId }).from(copyFingerprints).where(and(eq(copyFingerprints.documentId, documentId), eq(copyFingerprints.shareId, shareId))).limit(1);
      if (!fingerprint) return json({ error: { code: "LEGACY_REUPLOAD_REQUIRED", message: "This older copy has no fingerprint. Ask the owner to enable fingerprints for this group in History." } }, { status: 409 });
    }
    return json({ fingerprint, documentId, downloadUrl: await presignEncryptedDownload(record.objectKey), wrappedFileKey: record.wrappedFileKey, fileIv: record.fileIv });
  } catch (error) {
    return safeRouteError(error);
  }
}

function forbidden() {
  return json({ error: { code: "FORBIDDEN", message: "This file is not available." } }, { status: 403 });
}
