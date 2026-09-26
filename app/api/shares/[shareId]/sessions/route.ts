import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { createViewingSession } from "@/lib/activity/sessions";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { createViewingSession as createViewingSessionBody } from "@/lib/server/validators";

type Context = { params: Promise<{ shareId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const input = createViewingSessionBody.parse(await request.json());
    const result = await createViewingSession({
      shareId,
      documentId: input.documentId,
      user,
      browserFamily: input.browserFamily,
      platformCategory: input.platformCategory,
      viewportBucket: input.viewportBucket,
      dprBucket: input.dprBucket,
      webgpuOutcome: input.webgpuOutcome,
    });
    if ("error" in result) {
      if (result.error === "RATE_LIMITED") {
        return json({ error: { code: "RATE_LIMITED", message: "Too many viewing sessions. Try again shortly." } }, { status: 429 });
      }
      return json({ error: { code: "FORBIDDEN", message: "Not authorized to open a viewing session." } }, { status: 403 });
    }
    return json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: { code: "INVALID_SESSION", message: "Session request is invalid." } }, { status: 400 });
    }
    return safeRouteError(error);
  }
}
