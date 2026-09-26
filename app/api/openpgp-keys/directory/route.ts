import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { listSenderPublicKeys } from "@/lib/openpgp/directory";
import { json, safeRouteError } from "@/lib/server/http";

export async function GET() {
  try {
    await requireVerifiedUser();
    const senders = await listSenderPublicKeys();
    return json({ senders });
  } catch (error) {
    return safeRouteError(error);
  }
}
