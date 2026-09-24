import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { lookupRecipients } from "@/lib/auth/recipient-lookup";
import { getDb } from "@/lib/db";
import { uploadGroups } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { prepareRecipients } from "@/lib/server/validators";

export async function POST(request: Request, context: RouteContext<"/api/upload-groups/[groupId]/shares/prepare">) {
  try {
    const user = await requireVerifiedUser();
    const groupId = requireUuid((await context.params).groupId);
    const input = prepareRecipients.parse(await request.json());
    const [owned] = await getDb().select({ id: uploadGroups.id }).from(uploadGroups).where(and(
      eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, user.userId), eq(uploadGroups.status, "READY"),
    )).limit(1);
    if (!owned) return json({ error: { code: "NOT_FOUND", message: "Ready upload group not found." } }, { status: 404 });
    return json({ recipients: await lookupRecipients(input.recipientEmails) });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_RECIPIENTS", message: "Provide 1 to 100 valid email addresses." } }, { status: 400 });
    return safeRouteError(error);
  }
}
