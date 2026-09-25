import { describe, expect, it } from "vitest";
import { bytesToBase64url, base64urlToBytes } from "@/lib/crypto/base64url";
import { generateDocumentKey, generateUserKeyPair, unwrapDocumentKey, wrapDocumentKey } from "@/lib/crypto/core";
import { unwrapCopyIdentifier } from "@/lib/fingerprint/copy-secret";
import { prepareInvitation, claimInvitation } from "./invitation-crypto";
import { invitationProof } from "./invitation-proof";

describe("encrypted invitation grant", () => {
  it("lets a verified recipient prepare their own envelopes without changing the copy identifier", async () => {
    const owner = await generateUserKeyPair();
    const recipient = await generateUserKeyPair();
    const document = await generateDocumentKey();
    const shareId = "b6466658-8a89-4f28-b68f-c3ad0520779f";
    const documentId = "6e128ee4-eed3-41dd-8283-e721b9abff6d";
    const invitation = await prepareInvitation({ shareId, documents: [{ documentId,
      ownerWrappedKey: bytesToBase64url(new Uint8Array(await wrapDocumentKey(document, owner.publicKey))) }],
      existingFingerprints: [], ownerPrivateKey: owner.privateKey,
      ownerPublicKeyJwk: await crypto.subtle.exportKey("jwk", owner.publicKey) });
    const grant = await claimInvitation({ shareId, ciphertext: invitation.ciphertext, iv: invitation.iv,
      inviteSecret: invitation.inviteSecret, recipientPublicKeyJwk: await crypto.subtle.exportKey("jwk", recipient.publicKey) });
    expect(grant.proof).toBe(invitation.proof);
    expect(await invitationProof(invitation.inviteSecret)).toBe(invitation.proof);
    expect(await invitationProof(bytesToBase64url(new Uint8Array(32)))).not.toBe(invitation.proof);
    const original = new Uint8Array(await crypto.subtle.exportKey("raw", document));
    const claimed = await unwrapDocumentKey(base64urlToBytes(grant.envelopes[0].wrappedFileKey), recipient.privateKey, true);
    expect(new Uint8Array(await crypto.subtle.exportKey("raw", claimed))).toEqual(original);
    expect(await unwrapCopyIdentifier(documentId, invitation.fingerprints[0].ownerWrappedKey, owner.privateKey))
      .toEqual(await unwrapCopyIdentifier(documentId, grant.envelopes[0].recipientWrappedKey, recipient.privateKey));
    await expect(claimInvitation({ shareId, ciphertext: invitation.ciphertext, iv: invitation.iv,
      inviteSecret: bytesToBase64url(new Uint8Array(32)), recipientPublicKeyJwk: await crypto.subtle.exportKey("jwk", recipient.publicKey) }))
      .rejects.toThrow("does not match");
  });
});
