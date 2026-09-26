import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { publishedOpenPgpKeys } from "@/lib/openpgp/published-keys";
import { json, safeRouteError } from "@/lib/server/http";
import { openPgpKeyLookup } from "@/lib/server/validators";

export async function POST(request: Request) {
  try {
    await requireVerifiedUser();
    const input = openPgpKeyLookup.parse(await request.json());
    const keys = await publishedOpenPgpKeys(input.emails);
    return json({
      keys: [...keys].map(([email, key]) => ({ email, armoredPublicKey: key.armoredPublicKey, fingerprint: key.fingerprint })),
    });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_REQUEST", message: "Provide 1 to 100 valid email addresses." } }, { status: 400 });
    return safeRouteError(error);
  }
}
