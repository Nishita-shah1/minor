import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { refreshUploadGroupStatus } from "@/lib/server/upload-groups";

type Context = { params: Promise<{ documentId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const documentId = requireUuid((await context.params).documentId);
    const [failed] = await getDb().update(documents).set({ status: "FAILED", updatedAt: new Date() }).where(and(
      eq(documents.id, documentId),
      eq(documents.ownerClerkUserId, user.userId),
      eq(documents.status, "PENDING"),
    )).returning({ groupId: documents.groupId });
    if (failed) await refreshUploadGroupStatus(failed.groupId);
    return json({ failed: true });
  } catch (error) {
    return safeRouteError(error);
  }
}
