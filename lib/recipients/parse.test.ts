import { describe, expect, it } from "vitest";
import { parseEmailText, parseRecipientFile } from "./parse";

describe("recipient parser", () => {
  it("extracts, normalizes, and deduplicates email addresses", () => {
    expect(parseEmailText("Alice@Example.com, bob@example.org\nalice@example.com")).toEqual([
      "alice@example.com",
      "bob@example.org",
    ]);
  });

  it("rejects oversized recipient files before parsing", async () => {
    const file = new File([new Uint8Array(1024 * 1024 + 1)], "recipients.csv");
    await expect(parseRecipientFile(file)).rejects.toThrow("1 MiB or smaller");
  });
});
