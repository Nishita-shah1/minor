import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { userOpenpgpKeys } from "@/lib/db/schema";
import { OpenPgpKeyError, readPublishedPublicKey } from "@/lib/openpgp/public-key";
import { json, safeRouteError } from "@/lib/server/http";
import { openPgpPublicKeyBody } from "@/lib/server/validators";

export async function GET() {
  try {
    const user = await requireVerifiedUser();
    const [row] = await getDb().select({
      armoredPublicKey: userOpenpgpKeys.armoredPublicKey,
      fingerprint: userOpenpgpKeys.fingerprint,
    }).from(userOpenpgpKeys).where(eq(userOpenpgpKeys.clerkUserId, user.userId)).limit(1);
    return json({ key: row ?? null });
  } catch (error) {
    return safeRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireVerifiedUser();
    if (!user.verifiedEmails.length) {
      return json({ error: { code: "VERIFIED_EMAIL_REQUIRED", message: "Verify an email with Clerk first." } }, { status: 403 });
    }
    const input = openPgpPublicKeyBody.parse(await request.json());
    const parsed = await readPublishedPublicKey(input.armoredPublicKey);
    await getDb().insert(userOpenpgpKeys).values({
      clerkUserId: user.userId,
      armoredPublicKey: parsed.armoredPublicKey,
      fingerprint: parsed.fingerprint,
    }).onConflictDoUpdate({
      target: userOpenpgpKeys.clerkUserId,
      set: { armoredPublicKey: parsed.armoredPublicKey, fingerprint: parsed.fingerprint, updatedAt: new Date() },
    });
    return json({ fingerprint: parsed.fingerprint, armoredPublicKey: parsed.armoredPublicKey });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_REQUEST", message: "Paste an OpenPGP public key." } }, { status: 400 });
    if (error instanceof OpenPgpKeyError) return json({ error: { code: "INVALID_PUBLIC_KEY", message: error.message } }, { status: 400 });
    return safeRouteError(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireVerifiedUser();
    await getDb().delete(userOpenpgpKeys).where(eq(userOpenpgpKeys.clerkUserId, user.userId));
    return json({ removed: true });
  } catch (error) {
    return safeRouteError(error);
  }
}
