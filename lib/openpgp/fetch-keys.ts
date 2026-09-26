export async function fetchPublishedOpenPgpKeys(emails: string[]) {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(Boolean);
  const keys = new Map<string, string>();
  if (!unique.length) return keys;
  const response = await fetch("/api/openpgp-keys/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ emails: unique }),
  });
  const body = await response.json() as { keys?: Array<{ email: string; armoredPublicKey: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Could not look up OpenPGP keys.");
  for (const key of body.keys ?? []) keys.set(key.email, key.armoredPublicKey);
  return keys;
}
