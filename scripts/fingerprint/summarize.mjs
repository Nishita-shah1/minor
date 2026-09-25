// Summarize measured results without converting tuning into qualification.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const directory = process.argv[2];
if (!directory) throw new Error("Pass a qualification output directory");
const report = JSON.parse(await readFile(path.join(directory, "report.json"), "utf8"));
const lines = [
  "# TrustMark screenshot tuning results", "",
  `Profile: ${report.profile.id ?? report.profile.profileId}; strength ${report.strength}. Browser ${report.browser}.`, "",
  `**${report.requiredGate ?? "INCOMPLETE"}. No production profile is qualified.**`, "",
  "Six synthetic tuning documents (four PDFs, two PNGs), three identifiers each. These are not the required ten held-out PDFs. Alignment uses known synthetic correspondences. Candidate sets reuse the same decoded capture and do not constitute independent trials.", "",
  "| Case | Candidate count | Correct | Misses | Wrong |", "|---|---:|---:|---:|---:|",
];
for (const name of [...new Set(report.positive.map(row => row.case))]) {
  const rows = report.positive.filter(row => row.case === name);
  for (const [index, count] of report.candidateCounts.entries()) {
    const correct = rows.filter(row => row.correct[index]).length;
    const wrong = rows.filter(row => row.wrong[index]).length;
    lines.push(`| ${name}${rows[0].experimental ? " (experimental)" : ""} | ${count} | ${correct}/${rows.length} | ${rows.length - correct - wrong} | ${wrong} |`);
  }
}
lines.push("", "## Negatives", "", "| Category | Inputs | Named recipient |", "|---|---:|---:|");
for (const category of [...new Set(report.negative.map(row => row.category))]) {
  const rows = report.negative.filter(row => row.category === category);
  lines.push(`| ${category} | ${rows.length} | ${rows.filter(row => row.falseMatches.some(Boolean)).length} |`);
}
const falseMatches = report.negative.filter(row => row.falseMatches.some(Boolean)).length;
lines.push("", falseMatches ? `${falseMatches} negative inputs named a recipient.` : `No wrong attributions observed in these ${report.negative.length} negative tests.`, "",
  "Each negative input uses candidate counts 1, 3, and 100. Unsupported coverage is rejected before inference by the declared procedure. This does not establish a production false-attribution rate.", "",
  "## Limits", "", "Human readability, blind demonstrations, held-out qualification, phone photography, full-app privacy, and recipient sharing integration: **NOT RUN**.", "",
  "Browser canvas JPEG quality 0.85 with MIME verification; high-quality canvas resizing; actual marked-canvas PNG screenshots at DPR 1. Dimensions, timings, observed coverage, input hashes, model manifest, adapter, and browser flags are in report.json.", "",
  "Timing samples include alignment and up to two decodes. Candidate resolution time covers all three candidate sets together. JS heap samples exclude native GPU memory; they are not proof of cleanup or bounded total memory.", "");
await writeFile(path.join(directory, "summary.md"), lines.join("\n"));
const pairs = report.corpus.map(row => `<section><h2>Document ${row.document}: ${row.format}</h2><div><figure><img src="control-${row.document}.png"><figcaption>Control</figcaption></figure><figure><img src="marked-${row.document}.png"><figcaption>Marked, strength ${report.strength}</figcaption></figure></div></section>`).join("");
await writeFile(path.join(directory, "readability.html"), `<!doctype html><meta charset="utf-8"><title>Readability review — NOT RUN</title><style>body{font:18px sans-serif;margin:2rem;background:#fff8e7}section{border:2px solid black;border-radius:16px;padding:1rem;margin:2rem 0}section div{display:flex;gap:1rem}figure{margin:0;width:50%}img{width:100%}</style><h1>Paired readability review — NOT RUN</h1><p>Two human reviewers must independently read/transcribe selected text, numbers and punctuation; compare errors and distracting texture. Record reviewer, document, task, control errors, marked errors, texture observations and acceptance. These images alone are not a completed review.</p>${pairs}`);
console.log(path.join(directory, "summary.md"));
