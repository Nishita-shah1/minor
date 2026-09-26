import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { cameraEventTypes } from "@/lib/camera/events";
import { accessEvents, shares } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { accessEvent } from "@/lib/server/validators";

type Context = { params: Promise<{ shareId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const input = accessEvent.parse(await request.json());
    const [share] = await getDb().select({ recipient: shares.recipientClerkUserId, cameraRequired: shares.cameraRequired }).from(shares).where(eq(shares.id, shareId)).limit(1);
    if (!share || share.recipient !== user.userId) return json({ error: { code: "FORBIDDEN", message: "Not authorized." } }, { status: 403 });
    if (cameraEventTypes.some(type => type === input.eventType) && !share.cameraRequired)
      return json({ error: { code: "CAMERA_NOT_REQUIRED", message: "This link does not use webcam checks." } }, { status: 400 });
    await getDb().insert(accessEvents).values({ shareId, clerkUserId: user.userId, eventType: input.eventType,
      sessionId: input.sessionId ?? null, durationMs: input.durationMs ?? null });
    return json({ recorded: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_EVENT", message: "Event is invalid." } }, { status: 400 });
    return safeRouteError(error);
  }
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const [share] = await getDb().select({ sender: shares.senderClerkUserId }).from(shares).where(eq(shares.id, shareId)).limit(1);
    if (!share || share.sender !== user.userId) return json({ error: { code: "FORBIDDEN", message: "Not authorized." } }, { status: 403 });
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const events = await getDb().select({ eventType: accessEvents.eventType, sessionId: accessEvents.sessionId,
      createdAt: accessEvents.createdAt, durationMs: accessEvents.durationMs })
      .from(accessEvents).where(and(eq(accessEvents.shareId, shareId), gte(accessEvents.createdAt, cutoff),
        inArray(accessEvents.eventType, [...cameraEventTypes])))
      .orderBy(desc(accessEvents.createdAt)).limit(50);
    return json({ events });
  } catch (error) { return safeRouteError(error); }
}
