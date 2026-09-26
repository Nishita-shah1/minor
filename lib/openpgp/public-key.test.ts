import { generateKey, readMessage, readPrivateKey } from "openpgp";
import { describe, expect, it } from "vitest";
import { assertEncryptedForKey, readPublishedPublicKey } from "./public-key";
import { encryptShareEmail } from "./share-email";

const shareUrl = "https://example.test/share/11111111-1111-4111-8111-111111111111";

async function keyPair() {
  return generateKey({
    type: "curve25519",
    userIDs: [{ name: "Alice Example", email: "alice@example.test" }],
    format: "armored",
  });
}

describe("imported OpenPGP public keys", () => {
  it("stores a public encryption key and rejects a private key", async () => {
    const generated = await keyPair();
    const parsed = await readPublishedPublicKey(generated.publicKey);
    expect(parsed.fingerprint).toMatch(/^[a-f0-9]{40,64}$/);
    expect(parsed.armoredPublicKey).toContain("BEGIN PGP PUBLIC KEY BLOCK");
    expect(parsed.armoredPublicKey).not.toContain("PRIVATE KEY");
    await expect(readPublishedPublicKey(generated.privateKey)).rejects.toThrow(/public key/i);
    await expect(readPublishedPublicKey("not a key")).rejects.toThrow(/ASCII-armored/);
  });

  it("encrypts a share email that only the private key can read", async () => {
    const generated = await keyPair();
    const other = await keyPair();
    const parsed = await readPublishedPublicKey(generated.publicKey);
    const encrypted = await encryptShareEmail({
      armoredPublicKey: parsed.armoredPublicKey,
      recipientEmail: "alice@example.test",
      shareUrl,
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    expect(encrypted).toContain("BEGIN PGP MESSAGE");
    expect(encrypted).not.toContain(shareUrl);
    await expect(assertEncryptedForKey(encrypted, parsed.armoredPublicKey)).resolves.toBeUndefined();
    await expect(assertEncryptedForKey(encrypted, other.publicKey)).rejects.toThrow(/published key/);
    const message = await readMessage({ armoredMessage: encrypted });
    const decrypted = await message.decrypt([await readPrivateKey({ armoredKey: generated.privateKey })]);
    const text = await decrypted.getText();
    expect(text).toContain(shareUrl);
    expect(text).toContain("alice@example.test");
    expect(text).toContain("2026-10-01T00:00:00.000Z");
  });
});
