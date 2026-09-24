import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents } from "@/lib/db/schema";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

type Context = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const documentId = requireUuid((await context.params).documentId);
    const [row] = await getDb()
      .select({ wrappedFileKey: documentKeyEnvelopes.wrappedFileKey, keyVersion: documentKeyEnvelopes.keyVersion })
      .from(documents)
      .innerJoin(documentKeyEnvelopes, and(
        eq(documentKeyEnvelopes.documentId, documents.id),
        eq(documentKeyEnvelopes.clerkUserId, user.userId),
      ))
      .where(and(
        eq(documents.id, documentId),
        eq(documents.ownerClerkUserId, user.userId),
        eq(documents.status, "READY"),
      ))
      .limit(1);
    if (!row) return json({ error: { code: "NOT_FOUND", message: "Owner envelope not found." } }, { status: 404 });
    return json(row);
  } catch (error) {
    return safeRouteError(error);
  }
}
