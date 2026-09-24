import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { accessEvents, shares } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { accessEvent } from "@/lib/server/validators";

type Context = { params: Promise<{ shareId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const input = accessEvent.parse(await request.json());
    const [share] = await getDb().select({ recipient: shares.recipientClerkUserId }).from(shares).where(eq(shares.id, shareId)).limit(1);
    if (!share || share.recipient !== user.userId) return json({ error: { code: "FORBIDDEN", message: "Not authorized." } }, { status: 403 });
    await getDb().insert(accessEvents).values({ shareId, clerkUserId: user.userId, eventType: input.eventType });
    return json({ recorded: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_EVENT", message: "Event is invalid." } }, { status: 400 });
    return safeRouteError(error);
  }
}
