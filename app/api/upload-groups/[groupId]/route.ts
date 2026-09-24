import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { deleteOwnedGroup } from "@/lib/server/delete-upload";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

export async function DELETE(_request: Request, context: RouteContext<"/api/upload-groups/[groupId]">) {
  try {
    const user = await requireVerifiedUser();
    const found = await deleteOwnedGroup(requireUuid((await context.params).groupId), user.userId);
    return found ? json({ deleted: true }) : json({ error: { code: "NOT_FOUND", message: "Upload group not found." } }, { status: 404 });
  } catch (error) {
    return safeRouteError(error);
  }
}
