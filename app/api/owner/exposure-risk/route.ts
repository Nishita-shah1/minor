import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { loadOwnerExposureRisk } from "@/lib/activity/owner-exposure";
import { json, safeRouteError } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await requireVerifiedUser();
    const summary = await loadOwnerExposureRisk(user.userId);
    return json(summary);
  } catch (error) {
    return safeRouteError(error);
  }
}
