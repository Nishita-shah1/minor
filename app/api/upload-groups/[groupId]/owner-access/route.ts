import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, uploadGroups, userKeyBundles, copyFingerprints } from "@/lib/db/schema";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

export async function GET(_request: Request, context: RouteContext<"/api/upload-groups/[groupId]/owner-access">) {
  try {
    const user = await requireVerifiedUser();
    const groupId = requireUuid((await context.params).groupId);
    const [group] = await getDb().select({ id: uploadGroups.id, status: uploadGroups.status }).from(uploadGroups)
      .where(and(eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId))).limit(1);
    if (!group) return json({ error: { code: "NOT_FOUND", message: "Upload group not found." } }, { status: 404 });
    const files = await getDb().select({
      documentId: documents.id,
      status: documents.status,
      encryptedMetadata: documents.encryptedMetadata,
      metadataIv: documents.metadataIv,
      wrappedFileKey: documentKeyEnvelopes.wrappedFileKey,
    }).from(documents).leftJoin(documentKeyEnvelopes, and(
      eq(documentKeyEnvelopes.documentId, documents.id),
      eq(documentKeyEnvelopes.clerkUserId, user.userId),
    )).where(eq(documents.groupId, groupId));
    const enabled = experimentalFingerprintingEnabled();
    const [bundle] = enabled ? await getDb().select({ publicKeyJwk: userKeyBundles.publicKeyJwk }).from(userKeyBundles).where(eq(userKeyBundles.clerkUserId, user.userId)).limit(1) : [];
    const fingerprints = enabled ? await getDb().select({ documentId: copyFingerprints.documentId, ownerWrappedKey: copyFingerprints.ownerWrappedKey }).from(copyFingerprints).innerJoin(documents, eq(documents.id, copyFingerprints.documentId)).where(eq(documents.groupId, groupId)) : [];
    return json({ groupId, status: group.status, files, fingerprintOwnerPublicKey: bundle?.publicKeyJwk, existingFingerprints: fingerprints });
  } catch (error) {
    return safeRouteError(error);
  }
}
