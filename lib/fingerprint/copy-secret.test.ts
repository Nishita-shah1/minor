import { expect, it } from "vitest";
import { generateUserKeyPair } from "@/lib/crypto/core";
import { createCopySecret, unwrapCopyIdentifier } from "./copy-secret";
import { identifierHex } from "./identity";
it("separately wraps a stable copy secret to owner and recipient, and isolates other recipients", async () => {
  const owner = await generateUserKeyPair(), recipient = await generateUserKeyPair();
  const documentId = "11111111-1111-4111-8111-111111111111", used = new Set<string>();
  const first = await createCopySecret(documentId, owner.publicKey, recipient.publicKey, used);
  const ownerId = await unwrapCopyIdentifier(documentId, first.ownerWrappedKey, owner.privateKey);
  const recipientId = await unwrapCopyIdentifier(documentId, first.recipientWrappedKey, recipient.privateKey);
  expect(ownerId).toEqual(recipientId);
  expect(used.has(identifierHex(ownerId))).toBe(true);
  await expect(unwrapCopyIdentifier(documentId, first.recipientWrappedKey, owner.privateKey)).rejects.toThrow();
  const second = await createCopySecret(documentId, owner.publicKey, recipient.publicKey, used);
  expect(identifierHex(await unwrapCopyIdentifier(documentId, second.ownerWrappedKey, owner.privateKey))).not.toBe(identifierHex(ownerId));
});
