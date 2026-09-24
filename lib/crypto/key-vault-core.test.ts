import { describe, expect, it } from "vitest";
import { decryptPrivateKeyBackup, encryptPrivateKeyBackup } from "./key-vault-core";

describe("key vault backup", () => {
  it("decrypts only with the correct recovery passphrase", async () => {
    const source = new Uint8Array([4, 8, 15, 16, 23, 42]);
    const backup = await encryptPrivateKeyBackup(source, "correct horse battery staple", "user_1");
    const decrypted = await decryptPrivateKeyBackup(backup, "correct horse battery staple", "user_1");
    expect(new Uint8Array(decrypted)).toEqual(source);
    await expect(decryptPrivateKeyBackup(backup, "wrong passphrase", "user_1")).rejects.toThrow();
  }, 20_000);
});
