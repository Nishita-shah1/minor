export type SenderPublicKey = {
  name: string;
  email: string | null;
  fingerprint: string;
  armoredPublicKey: string;
  aliases?: string;
};

const gauravPublicKey = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEardSrhYJKwYBBAHaRw8BAQdAdoYgF2I3JP63ykiRFp/W8rGPNNGj+L7RMZ71
kARCveS0K0VjaG9MZWFrcyBMb2NhbCA8ZWNob2xlYWtzLWxvY2FsQGxvY2FsaG9z
dD6IkwQTFgoAOxYhBHDSnzqcNRukVjbj2ydEG0N3v8nJBQJqt1KuAhsDBQsJCAcC
AiICBhUKCQgLAgQWAgMBAh4HAheAAAoJECdEG0N3v8nJlOkA/juyO/lyiqu74UcO
w0VvFQO5v6OQANvRQeg3Dg4bHE3WAQCbjF5e3lNZN5N7aR0VlPCapYkfh8mIkVpR
BnLva2vYBrg4BGq3Uq4SCisGAQQBl1UBBQEBB0BWKO6acyX2jAbfdkFwdQyHOSHm
0BQBF0KWvojqfoGseAMBCAeIeAQYFgoAIBYhBHDSnzqcNRukVjbj2ydEG0N3v8nJ
BQJqt1KuAhsMAAoJECdEG0N3v8nJopQA/2A8qXplq+DT53rCjEzO1krKJNSTgWFU
XJPINwh1jJ0IAQC9qT4lTc0dw5qQj3wBt0ZXOdji2Op5xeanMzqh5Ew4Ag==
=MGT3
-----END PGP PUBLIC KEY BLOCK-----`;

export const knownSenders: SenderPublicKey[] = [
  {
    name: "Gaurav",
    email: "echoleaks-local@localhost",
    fingerprint: "70d29f3a9c351ba45636e3db27441b4377bfc9c9",
    armoredPublicKey: gauravPublicKey,
    aliases: "Gaurav EchoLeaks Local echoleaks-local@localhost chaudharygaurav2004@gmail.com",
  },
];

export function mergeNamedKeys(known: SenderPublicKey[], published: SenderPublicKey[]) {
  const byFingerprint = new Map<string, SenderPublicKey>();
  for (const sender of known) {
    const fingerprint = sender.fingerprint.toLowerCase();
    byFingerprint.set(fingerprint, { ...sender, fingerprint });
  }
  for (const sender of published) {
    const fingerprint = sender.fingerprint.toLowerCase();
    if (byFingerprint.has(fingerprint)) continue;
    byFingerprint.set(fingerprint, { ...sender, fingerprint, name: sender.name.trim() || "Unnamed sender" });
  }
  return [...byFingerprint.values()].sort((left, right) => left.name.localeCompare(right.name));
}
