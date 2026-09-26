import { readKey, readMessage } from "openpgp";

const MAX_ARMOR = 100_000;

export class OpenPgpKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenPgpKeyError";
  }
}

export async function readPublishedPublicKey(armoredInput: string) {
  const armoredKey = armoredInput.trim();
  if (!armoredKey || armoredKey.length > MAX_ARMOR) {
    throw new OpenPgpKeyError("Paste an ASCII-armored OpenPGP public key.");
  }
  if (armoredKey.includes("BEGIN PGP PRIVATE KEY BLOCK")) {
    throw new OpenPgpKeyError("Paste a public key. EchoLeaks does not accept private keys.");
  }
  if (!armoredKey.startsWith("-----BEGIN PGP PUBLIC KEY BLOCK-----") || !armoredKey.includes("-----END PGP PUBLIC KEY BLOCK-----")) {
    throw new OpenPgpKeyError("Paste an ASCII-armored OpenPGP public key.");
  }
  let key;
  try {
    key = await readKey({ armoredKey });
  } catch {
    throw new OpenPgpKeyError("This public key could not be read.");
  }
  if (key.isPrivate()) throw new OpenPgpKeyError("Paste a public key. EchoLeaks does not accept private keys.");
  try {
    await key.getEncryptionKey();
  } catch {
    throw new OpenPgpKeyError("This key cannot encrypt messages.");
  }
  const fingerprint = key.getFingerprint().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(fingerprint)) throw new OpenPgpKeyError("This public key fingerprint is invalid.");
  return { armoredPublicKey: key.armor(), fingerprint };
}

export async function assertEncryptedForKey(armoredMessage: string, armoredPublicKey: string) {
  const messageText = armoredMessage.trim();
  if (!messageText.startsWith("-----BEGIN PGP MESSAGE-----") || !messageText.includes("-----END PGP MESSAGE-----")) {
    throw new OpenPgpKeyError("The email must be an OpenPGP message.");
  }
  let key;
  let message;
  try {
    key = await readKey({ armoredKey: armoredPublicKey });
    message = await readMessage({ armoredMessage: messageText });
  } catch {
    throw new OpenPgpKeyError("The encrypted email could not be read.");
  }
  const encryptionKey = await key.getEncryptionKey();
  const matches = message.getEncryptionKeyIDs().some((id) => id.equals(encryptionKey.getKeyID()));
  if (!matches) throw new OpenPgpKeyError("This message is not encrypted to the recipient's published key.");
}
