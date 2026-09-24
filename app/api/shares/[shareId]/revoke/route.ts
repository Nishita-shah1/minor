import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { shares } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

type Context = { params: Promise<{ shareId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const [revoked] = await getDb().update(shares).set({ status: "REVOKED", revokedAt: new Date() }).where(and(
      eq(shares.id, shareId), eq(shares.senderClerkUserId, user.userId),
    )).returning({ id: shares.id });
    if (!revoked) return json({ error: { code: "NOT_FOUND", message: "Share not found." } }, { status: 404 });
    return json({ revoked: true });
  } catch (error) {
    return safeRouteError(error);
  }
}
