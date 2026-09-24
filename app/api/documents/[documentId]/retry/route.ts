import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documents, uploadGroups } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

export async function POST(_request: Request, context: RouteContext<"/api/documents/[documentId]/retry">) {
  try {
    const user = await requireVerifiedUser();
    const documentId = requireUuid((await context.params).documentId);
    const [document] = await getDb().update(documents).set({ status: "PENDING", updatedAt: new Date() }).where(and(
      eq(documents.id, documentId), eq(documents.ownerClerkUserId, user.userId), eq(documents.status, "FAILED"),
    )).returning({ groupId: documents.groupId });
    if (!document) {
      const [existing] = await getDb().select({ status: documents.status }).from(documents).where(and(
        eq(documents.id, documentId), eq(documents.ownerClerkUserId, user.userId),
      )).limit(1);
      if (existing?.status === "READY") return json({ retrying: false, alreadyReady: true });
      return json({ error: { code: "INVALID_STATE", message: "This file cannot be retried." } }, { status: 409 });
    }
    await getDb().update(uploadGroups).set({ status: "PROTECTING", updatedAt: new Date() }).where(eq(uploadGroups.id, document.groupId));
    return json({ retrying: true, alreadyReady: false });
  } catch (error) {
    return safeRouteError(error);
  }
}
