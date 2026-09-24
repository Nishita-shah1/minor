const encoder = new TextEncoder();

export function fileAad(documentId: string) {
  return encoder.encode(`echoleaks:file:v1:${documentId}`);
}

export function metadataAad(documentId: string) {
  return encoder.encode(`echoleaks:metadata:v1:${documentId}`);
}

export function vaultAad(clerkUserId: string) {
  return encoder.encode(`echoleaks:key-vault:v1:${clerkUserId}`);
}
