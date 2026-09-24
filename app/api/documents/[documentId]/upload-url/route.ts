import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documents, uploadGroups } from "@/lib/db/schema";
import { presignEncryptedUpload } from "@/lib/r2/objects";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

export async function POST(_request: Request, context: RouteContext<"/api/documents/[documentId]/upload-url">) {
  try {
    const user = await requireVerifiedUser();
    const documentId = requireUuid((await context.params).documentId);
    const [row] = await getDb().select({ objectKey: documents.r2ObjectKey }).from(documents)
      .innerJoin(uploadGroups, eq(uploadGroups.id, documents.groupId))
      .where(and(
        eq(documents.id, documentId),
        eq(documents.ownerClerkUserId, user.userId),
        eq(documents.status, "PENDING"),
        eq(uploadGroups.status, "PROTECTING"),
      )).limit(1);
    if (!row?.objectKey) return json({ error: { code: "INVALID_STATE", message: "This upload slot is unavailable." } }, { status: 409 });
    return json(await presignEncryptedUpload(row.objectKey));
  } catch (error) {
    return safeRouteError(error);
  }
}
