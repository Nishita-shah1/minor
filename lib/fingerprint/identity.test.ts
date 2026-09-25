import { expect, it } from "vitest";
import { deriveIdentifier, identifierHex, resolveIdentifier } from "./identity";

it("derives stable document-scoped five-byte identifiers", async () => {
  const secret = new Uint8Array(32).fill(7);
  const document = "00000000-0000-4000-8000-000000000001";
  const identifier = await deriveIdentifier(document, secret);
  expect(identifierHex(identifier)).toBe("7f27e6d14d");
  expect(await deriveIdentifier(document, secret)).toEqual(identifier);
  expect(await deriveIdentifier("00000000-0000-4000-8000-000000000002", secret)).not.toEqual(identifier);
  expect(identifierHex(identifier)).toMatch(/^[a-f0-9]{10}$/);
  await expect(deriveIdentifier("invalid", secret)).rejects.toThrow();
  await expect(deriveIdentifier(document, new Uint8Array(31))).rejects.toThrow();
});

it("requires an exact unique identifier, including single-candidate scans", () => {
  const one = new Uint8Array([1, 2, 3, 4, 5]);
  const two = new Uint8Array([1, 2, 3, 4, 6]);
  expect(resolveIdentifier(one, [{ id: "a", identifier: one }])).toEqual({ status: "CANDIDATE_MATCH", candidateId: "a" });
  expect(resolveIdentifier(two, [{ id: "a", identifier: one }])).toEqual({ status: "UNKNOWN_MARK" });
  expect(resolveIdentifier(one, [{ id: "a", identifier: one }, { id: "b", identifier: one }])).toEqual({ status: "INCONCLUSIVE" });
});
