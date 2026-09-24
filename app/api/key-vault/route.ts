import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { publicKeyFingerprint } from "@/lib/crypto/core";
import { getDb } from "@/lib/db";
import { userKeyBundles } from "@/lib/db/schema";
import { json, safeRouteError } from "@/lib/server/http";
import { keyBundleRegistration } from "@/lib/server/validators";

export async function GET() {
  try {
    const user = await requireVerifiedUser();
    const [bundle] = await getDb()
      .select()
      .from(userKeyBundles)
      .where(eq(userKeyBundles.clerkUserId, user.userId))
      .limit(1);
    if (!bundle) return json({ bundle: null });
    return json({
      bundle: {
        publicKeyJwk: bundle.publicKeyJwk,
        publicKeyFingerprint: bundle.publicKeyFingerprint,
        encryptedPrivateKey: bundle.encryptedPrivateKey,
        privateKeyIv: bundle.privateKeyIv,
        kdfSalt: bundle.kdfSalt,
        kdfParameters: bundle.kdfParameters,
        keyVersion: bundle.keyVersion,
      },
    });
  } catch (error) {
    return safeRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedUser();
    if (!user.verifiedEmails.length) {
      return json({ error: { code: "VERIFIED_EMAIL_REQUIRED", message: "Verify an email with Clerk first." } }, { status: 403 });
    }
    const input = keyBundleRegistration.parse(await request.json());
    const fingerprint = await publicKeyFingerprint(input.publicKeyJwk);
    if (fingerprint !== input.publicKeyFingerprint) {
      return json({ error: { code: "INVALID_FINGERPRINT", message: "The public-key fingerprint is invalid." } }, { status: 400 });
    }

    const [existing] = await getDb()
      .select({ fingerprint: userKeyBundles.publicKeyFingerprint })
      .from(userKeyBundles)
      .where(eq(userKeyBundles.clerkUserId, user.userId))
      .limit(1);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return json({ error: { code: "KEY_CONFLICT", message: "This account already has a different encryption key." } }, { status: 409 });
      }
      return json({ registered: true, existing: true });
    }

    await getDb().insert(userKeyBundles).values({
      clerkUserId: user.userId,
      publicKeyJwk: input.publicKeyJwk,
      publicKeyFingerprint: fingerprint,
      encryptedPrivateKey: input.encryptedPrivateKey,
      privateKeyIv: input.privateKeyIv,
      kdfSalt: input.kdfSalt,
      kdfParameters: input.kdfParameters,
      keyVersion: input.keyVersion,
    });
    return json({ registered: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: { code: "INVALID_REQUEST", message: "The key bundle is invalid." } }, { status: 400 });
    }
    return safeRouteError(error);
  }
}
