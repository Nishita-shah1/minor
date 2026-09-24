import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { deleteOwnedDocument } from "@/lib/server/delete-upload";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

export async function DELETE(_request: Request, context: RouteContext<"/api/documents/[documentId]">) {
  try {
    const user = await requireVerifiedUser();
    const found = await deleteOwnedDocument(requireUuid((await context.params).documentId), user.userId);
    return found ? json({ deleted: true }) : json({ error: { code: "NOT_FOUND", message: "Document not found." } }, { status: 404 });
  } catch (error) {
    return safeRouteError(error);
  }
}
