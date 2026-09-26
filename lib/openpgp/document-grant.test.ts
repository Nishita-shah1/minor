import { generateKey, readKey } from "openpgp";
import { describe, expect, it } from "vitest";
import { decryptOpenPgpGrant, encryptOpenPgpGrant, readOpenPgpKeyPair, type OpenPgpGrant } from "./document-grant";

describe("OpenPGP document grants", () => {
  it("round-trips a share grant with the private key and rejects another key", async () => {
    const owner = await generateKey({ type: "curve25519", userIDs: [{ name: "Alice", email: "alice@example.test" }], format: "armored" });
    const other = await generateKey({ type: "curve25519", userIDs: [{ name: "Bob", email: "bob@example.test" }], format: "armored" });
    const grant: OpenPgpGrant = {
      version: 1,
      shareId: "33333333-3333-4333-8333-333333333333",
      documents: [{ documentId: "44444444-4444-4444-8444-444444444444", documentKey: "a".repeat(43), fingerprintSecret: null }],
    };
    const message = await encryptOpenPgpGrant(owner.publicKey, grant);
    const fingerprint = (await readKey({ armoredKey: owner.publicKey })).getFingerprint();
    expect(message).not.toContain(grant.shareId);
    await expect(decryptOpenPgpGrant({ armoredPrivateKey: owner.privateKey, passphrase: "", armoredMessage: message, shareId: grant.shareId, expectedFingerprint: fingerprint })).resolves.toMatchObject({ shareId: grant.shareId });
    await expect(decryptOpenPgpGrant({ armoredPrivateKey: other.privateKey, passphrase: "", armoredMessage: message, shareId: grant.shareId, expectedFingerprint: fingerprint })).rejects.toThrow(/does not match/);
  });

  it("reads the public key from a typed private key", async () => {
    const owner = await generateKey({ type: "curve25519", userIDs: [{ name: "Alice", email: "alice@example.test" }], format: "armored" });
    const pair = await readOpenPgpKeyPair(owner.privateKey, "");
    const published = await readKey({ armoredKey: owner.publicKey });
    expect(pair.fingerprint).toBe(published.getFingerprint().toLowerCase());
    expect(pair.armoredPublicKey).toContain("BEGIN PGP PUBLIC KEY BLOCK");
    expect(pair.armoredPublicKey).not.toContain("PRIVATE KEY");
  });
});
