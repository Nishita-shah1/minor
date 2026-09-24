import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, uploadGroups } from "@/lib/db/schema";
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
    return json({ groupId, status: group.status, files });
  } catch (error) {
    return safeRouteError(error);
  }
}
