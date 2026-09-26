import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readKeys } from "openpgp";
import type { SenderPublicKey } from "@/lib/openpgp/known-senders";

const execFileAsync = promisify(execFile);
const gauravFingerprint = "70d29f3a9c351ba45636e3db27441b4377bfc9c9";

function userIdParts(value: string) {
  const match = /^(.*?)(?:\s*\((.*?)\))?\s*(?:<([^>]+)>)?$/.exec(value.trim());
  return {
    name: match?.[1]?.trim() ?? "",
    comment: match?.[2]?.trim() ?? "",
    email: match?.[3]?.trim() ?? "",
  };
}

async function senderFromKey(key: Awaited<ReturnType<typeof readKeys>>[number]) {
  if (key.isPrivate()) return null;
  try {
    await key.getEncryptionKey();
  } catch {
    return null;
  }
  const fingerprint = key.getFingerprint().toLowerCase();
  const userIds = key.getUserIDs();
  const identities = userIds.map(userIdParts);
  const preferred = identities.find((identity) => identity.name.includes(" ")) ?? identities.find((identity) => identity.name);
  const named = fingerprint === gauravFingerprint;
  const sender: SenderPublicKey = {
    name: named ? "Gaurav" : preferred?.name || "Unnamed sender",
    email: (named ? identities.find((identity) => identity.email)?.email : preferred?.email) || null,
    fingerprint,
    armoredPublicKey: key.armor(),
    aliases: userIds.join(" "),
  };
  return sender;
}

export async function sendersFromArmored(armored: string) {
  const blocks = armored.split(/(?=-----BEGIN PGP PUBLIC KEY BLOCK-----)/).map((part) => part.trim()).filter((part) => part.startsWith("-----BEGIN PGP PUBLIC KEY BLOCK-----"));
  const keys = (await Promise.all(blocks.map((block) => readKeys({ armoredKeys: block })))).flat();
  const senders = await Promise.all(keys.map(senderFromKey));
  return senders.filter((sender): sender is SenderPublicKey => sender !== null);
}

export async function localKeyringSenders() {
  try {
    const { stdout } = await execFileAsync("gpg", ["--batch", "--export", "--armor"], { timeout: 8000, maxBuffer: 5_000_000 });
    return await sendersFromArmored(stdout);
  } catch (error) {
    console.error("Local OpenPGP keyring export failed", error instanceof Error ? error.name : typeof error);
    return [];
  }
}
