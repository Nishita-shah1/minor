import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { shareOpenpgpEnvelopes, shares, uploadGroups } from "@/lib/db/schema";
import { OpenPgpKeyError, assertEncryptedForKey, readPublishedPublicKey } from "@/lib/openpgp/public-key";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { z } from "zod";

const bodySchema = z.object({
  armoredPublicKey: z.string().trim().min(1).max(100_000),
  armoredMessage: z.string().trim().min(1).max(200_000),
});

export async function POST(request: Request, context: { params: Promise<{ shareId: string }> }) {
  try {
    const user = await requireVerifiedUser();
    const shareId = requireUuid((await context.params).shareId);
    const input = bodySchema.parse(await request.json());
    const [share] = await getDb().select({ id: shares.id, groupStatus: uploadGroups.status }).from(shares)
      .innerJoin(uploadGroups, eq(uploadGroups.id, shares.groupId))
      .where(and(eq(shares.id, shareId), eq(shares.senderClerkUserId, user.userId))).limit(1);
    if (!share || share.groupStatus !== "READY") return json({ error: { code: "NOT_FOUND", message: "Share not found." } }, { status: 404 });
    const publicKey = await readPublishedPublicKey(input.armoredPublicKey);
    if (input.armoredMessage.includes("documentKey") || input.armoredMessage.includes(shareId)) {
      return json({ error: { code: "PLAINTEXT_GRANT", message: "The stored message still contains the document key." } }, { status: 400 });
    }
    await assertEncryptedForKey(input.armoredMessage, publicKey.armoredPublicKey);
    await getDb().insert(shareOpenpgpEnvelopes).values({
      shareId,
      fingerprint: publicKey.fingerprint,
      armoredPublicKey: publicKey.armoredPublicKey,
      armoredMessage: input.armoredMessage.trim(),
    }).onConflictDoUpdate({
      target: shareOpenpgpEnvelopes.shareId,
      set: {
        fingerprint: publicKey.fingerprint,
        armoredPublicKey: publicKey.armoredPublicKey,
        armoredMessage: input.armoredMessage.trim(),
      },
    });
    return json({ saved: true, fingerprint: publicKey.fingerprint });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_REQUEST", message: "The public key upload is invalid." } }, { status: 400 });
    if (error instanceof OpenPgpKeyError) return json({ error: { code: "INVALID_ENCRYPTION", message: error.message } }, { status: 400 });
    return safeRouteError(error);
  }
}
