import { and, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cameraEventTypes } from "@/lib/camera/events";
import { accessEvents } from "@/lib/db/schema";
import { json, safeRouteError } from "@/lib/server/http";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return json({ error: { code: "FORBIDDEN", message: "Not authorized." } }, { status: 403 });
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await getDb().delete(accessEvents).where(and(lt(accessEvents.createdAt, cutoff),
      inArray(accessEvents.eventType, [...cameraEventTypes])));
    return json({ purgedBefore: cutoff.toISOString() });
  } catch (error) { return safeRouteError(error); }
}
