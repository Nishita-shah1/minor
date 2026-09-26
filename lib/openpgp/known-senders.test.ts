import { generateKey } from "openpgp";
import { describe, expect, it } from "vitest";
import { knownSenders, mergeNamedKeys } from "./known-senders";
import { sendersFromArmored } from "./local-keyring";
import { readPublishedPublicKey } from "./public-key";

describe("named sender public keys", () => {
  it("maps the local OpenPGP public key to Gaurav", async () => {
    const gaurav = knownSenders.find((sender) => sender.name === "Gaurav");
    expect(gaurav?.email).toBe("echoleaks-local@localhost");
    expect(gaurav?.aliases).toContain("Gaurav");
    const parsed = await readPublishedPublicKey(gaurav!.armoredPublicKey);
    expect(parsed.fingerprint).toBe(gaurav!.fingerprint);
  });

  it("keeps Gaurav's name when that fingerprint is also published under another name", () => {
    const gaurav = knownSenders[0];
    const merged = mergeNamedKeys(knownSenders, [
      {
        name: "Someone Else",
        email: "other@example.test",
        fingerprint: gaurav.fingerprint.toUpperCase(),
        armoredPublicKey: "replaced-armor",
      },
      {
        name: "Mina",
        email: "mina@example.test",
        fingerprint: "abc123",
        armoredPublicKey: "mina-key",
      },
    ]);
    expect(merged.find((sender) => sender.fingerprint === gaurav.fingerprint)).toMatchObject({
      name: "Gaurav",
      armoredPublicKey: gaurav.armoredPublicKey,
    });
    expect(merged.map((sender) => sender.name)).toEqual(["Gaurav", "Mina"]);
  });

  it("reads the local keyring names, including Gaurav for the new key", async () => {
    const gaurav = knownSenders[0];
    const senders = await sendersFromArmored(gaurav.armoredPublicKey);
    expect(senders).toEqual([expect.objectContaining({ name: "Gaurav", fingerprint: gaurav.fingerprint })]);
    expect(senders[0]?.aliases).toContain("EchoLeaks Local");
  });

  it("keeps every public key from one export", async () => {
    const extra = await generateKey({ type: "curve25519", userIDs: [{ name: "Mina Example", email: "mina@example.test" }], format: "armored" });
    const senders = await sendersFromArmored(`${knownSenders[0].armoredPublicKey}\n${extra.publicKey}`);
    expect(senders.map((sender) => sender.name).sort()).toEqual(["Gaurav", "Mina Example"]);
  });
});
