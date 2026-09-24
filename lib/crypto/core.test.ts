import { describe, expect, it } from "vitest";
import { fileAad } from "./aad";
import { base64urlToBytes, bytesToBase64url } from "./base64url";
import {
  decryptAes,
  encryptAes,
  generateDocumentKey,
  generateUserKeyPair,
  unwrapDocumentKey,
  wrapDocumentKey,
} from "./core";

describe("crypto core", () => {
  it.each([
    ["empty", new Uint8Array()],
    ["all byte values", Uint8Array.from({ length: 256 }, (_, index) => index)],
  ])("round trips %s", async (_name, source) => {
    const key = await generateDocumentKey();
    const aad = fileAad("document-1");
    const encrypted = await encryptAes(source, key, aad);
    const decrypted = await decryptAes(encrypted.ciphertext, key, encrypted.iv, aad);
    expect(new Uint8Array(decrypted)).toEqual(source);
  });

  it("rejects changed ciphertext and AAD", async () => {
    const key = await generateDocumentKey();
    const encrypted = await encryptAes(new Uint8Array([1, 2, 3]), key, fileAad("one"));
    const changed = new Uint8Array(encrypted.ciphertext);
    changed[0] ^= 1;
    await expect(decryptAes(changed, key, encrypted.iv, fileAad("one"))).rejects.toThrow();
    await expect(decryptAes(encrypted.ciphertext, key, encrypted.iv, fileAad("two"))).rejects.toThrow();
  });

  it("wraps and unwraps a document key", async () => {
    const pair = await generateUserKeyPair();
    const key = await generateDocumentKey();
    const wrapped = await wrapDocumentKey(key, pair.publicKey);
    const unwrapped = await unwrapDocumentKey(wrapped, pair.privateKey);
    const encrypted = await encryptAes(new Uint8Array([9]), key, fileAad("wrapped"));
    const decrypted = await decryptAes(encrypted.ciphertext, unwrapped, encrypted.iv, fileAad("wrapped"));
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array([9]));
  });

  it("rejects a wrong RSA private key", async () => {
    const owner = await generateUserKeyPair();
    const stranger = await generateUserKeyPair();
    const wrapped = await wrapDocumentKey(await generateDocumentKey(), owner.publicKey);
    await expect(unwrapDocumentKey(wrapped, stranger.privateKey)).rejects.toThrow();
  });

  it("rejects a changed IV", async () => {
    const key = await generateDocumentKey();
    const encrypted = await encryptAes(new Uint8Array([1, 2, 3]), key, fileAad("iv"));
    const changedIv = encrypted.iv.slice();
    changedIv[0] ^= 1;
    await expect(decryptAes(encrypted.ciphertext, key, changedIv, fileAad("iv"))).rejects.toThrow();
  });

  it("round trips base64url", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(base64urlToBytes(bytesToBase64url(bytes))).toEqual(bytes);
  });
});
