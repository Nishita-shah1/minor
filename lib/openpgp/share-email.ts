export function shareEmailText(input: {
  recipientEmail: string;
  shareUrl: string;
  availableFrom?: string | Date | null;
  expiresAt?: string | Date | null;
}) {
  const opening = input.availableFrom ? `This access opens on ${new Date(input.availableFrom).toISOString()}.` : "";
  const expiry = input.expiresAt ? `This access expires on ${new Date(input.expiresAt).toISOString()}.` : "";
  const code = /^#invite=([A-Za-z0-9_-]{43})$/.exec(new URL(input.shareUrl).hash)?.[1];
  return [
    "A protected EchoLeaks file was shared with you.",
    `Sign in with this exact address: ${input.recipientEmail}`,
    opening,
    expiry,
    `Open the protected file: ${input.shareUrl}`,
    code ? `If the link loses its claim code, paste this code on the share page: ${code}` : "",
    "Do not forward this message. Possessing the link alone does not grant access.",
  ].filter(Boolean).join("\n");
}

export function containsShareSecret(armoredMessage: string, shareUrl: string) {
  if (armoredMessage.includes(shareUrl)) return true;
  const code = /^#invite=([A-Za-z0-9_-]{43})$/.exec(new URL(shareUrl).hash)?.[1];
  return Boolean(code && armoredMessage.includes(code));
}

export async function encryptShareEmail(input: {
  armoredPublicKey: string;
  recipientEmail: string;
  shareUrl: string;
  availableFrom?: string | Date | null;
  expiresAt?: string | Date | null;
}) {
  const text = shareEmailText(input);
  const openpgp = await import("openpgp");
  const encryptionKeys = await openpgp.readKey({ armoredKey: input.armoredPublicKey });
  if (encryptionKeys.isPrivate()) throw new Error("Recipient key must be a public key.");
  const message = await openpgp.createMessage({ text });
  const encrypted = await openpgp.encrypt({ message, encryptionKeys, format: "armored" });
  if (typeof encrypted !== "string" || containsShareSecret(encrypted, input.shareUrl)) {
    throw new Error("Could not encrypt the invitation.");
  }
  return encrypted;
}
