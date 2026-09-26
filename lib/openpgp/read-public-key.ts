// OpenPGP.js stays in a separate chunk until a key is checked.
export async function readImportedPublicKey(armoredKey: string) {
  const { readPublishedPublicKey } = await import("./public-key");
  return readPublishedPublicKey(armoredKey);
}
