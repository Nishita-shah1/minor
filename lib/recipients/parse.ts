import { normalizeEmail } from "@/lib/auth/email";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAX_RECIPIENT_FILE_BYTES = 1024 * 1024;

export function parseEmailText(text: string) {
  return [...new Set((text.match(emailPattern) ?? []).map(normalizeEmail))];
}

export async function parseRecipientFile(file: File) {
  if (file.size > MAX_RECIPIENT_FILE_BYTES) {
    throw new Error("Recipient lists must be 1 MiB or smaller.");
  }
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const rows = await readXlsxFile(file);
    return parseEmailText(rows.flat().map(String).join("\n"));
  }
  return parseEmailText(await file.text());
}
