import { and, eq, inArray } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documents, uploadGroups } from "@/lib/db/schema";
import { deleteOwnedDocument } from "@/lib/server/delete-upload";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

export async function POST(_request: Request, context: RouteContext<"/api/upload-groups/[groupId]/continue">) {
  try {
    const user = await requireVerifiedUser();
    const groupId = requireUuid((await context.params).groupId);
    const [group] = await getDb().select({ status: uploadGroups.status }).from(uploadGroups).where(and(
      eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId), inArray(uploadGroups.status, ["PARTIAL"]),
    )).limit(1);
    if (!group) return json({ error: { code: "INVALID_STATE", message: "This group cannot be finalized." } }, { status: 409 });
    const failed = await getDb().select({ id: documents.id }).from(documents)
      .where(and(eq(documents.groupId, groupId), eq(documents.status, "FAILED")));
    for (const row of failed) await deleteOwnedDocument(row.id, user.userId);
    const ready = await getDb().select({ id: documents.id }).from(documents)
      .where(and(eq(documents.groupId, groupId), eq(documents.status, "READY")));
    if (!ready.length) return json({ error: { code: "NO_READY_FILES", message: "Retry at least one file before continuing." } }, { status: 409 });
    await getDb().update(uploadGroups).set({ status: "READY", expectedFileCount: ready.length, updatedAt: new Date() })
      .where(eq(uploadGroups.id, groupId));
    return json({ ready: true, fileCount: ready.length });
  } catch (error) {
    return safeRouteError(error);
  }
}
