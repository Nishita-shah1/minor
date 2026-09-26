import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { appendSessionEvents } from "@/lib/activity/sessions";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { sessionEventBatch } from "@/lib/server/validators";

type Context = { params: Promise<{ shareId: string; sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const params = await context.params;
    const shareId = requireUuid(params.shareId);
    const sessionId = requireUuid(params.sessionId);
    const input = sessionEventBatch.parse(await request.json());
    const result = await appendSessionEvents({
      shareId,
      sessionId,
      user,
      events: input.events,
    });
    if ("error" in result) {
      if (result.error === "SESSION_EXPIRED") {
        return json({ error: { code: "SESSION_EXPIRED", message: "This viewing session expired. Reopen the protected view." } }, { status: 409 });
      }
      if (result.error === "INVALID_EVENTS") {
        return json({ error: { code: "INVALID_EVENTS", message: "Event batch is invalid." } }, { status: 400 });
      }
      return json({ error: { code: "FORBIDDEN", message: "Not authorized for this session." } }, { status: 403 });
    }
    return json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: { code: "INVALID_EVENTS", message: "Event batch is invalid." } }, { status: 400 });
    }
    return safeRouteError(error);
  }
}
