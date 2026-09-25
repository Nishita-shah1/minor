import { deflateSync } from "node:zlib";

// Non-confidential synthetic PDFs with actual text, vector tables, sparse layouts
// and an embedded image. These are tuning fixtures, not a representative corpus.
export function pdfFixture(seed, category) {
  const width = category === 1 ? 792 : 612, height = category === 1 ? 612 : 792;
  let content = `1 1 1 rg 0 0 ${width} ${height} re f\n0 0 0 rg\nBT /F1 20 Tf 36 ${height - 45} Td (PUBLIC TUNING DOCUMENT ${seed}) Tj ET\n`;
  const text = (x, y, size, value) => { content += `BT /F1 ${size} Tf ${x} ${y} Td (${value}) Tj ET\n`; };
  if (category === 0) {
    for (let row = 0; row < 43; row++) text(36, height - 80 - row * 15, 10, `Section ${row + 1}. Review item ${(seed * 97 + row * 13) % 10000}: local reference facts and punctuation, 17.25.`);
  } else if (category === 1) {
    for (let row = 0; row < 30; row++) {
      content += `0.7 G 36 ${height - 80 - row * 15} m ${width - 36} ${height - 80 - row * 15} l S\n`;
      for (let col = 0; col < 8; col++) text(40 + col * 87, height - 76 - row * 15, 8, `${row + 1}-${col + 1} ${((seed + 7) * (row + 3) * (col + 11) % 9999 / 100).toFixed(2)}`);
    }
  } else if (category === 2) {
    text(60, height - 150, 24, "A short confidential-looking public note.");
    text(60, height - 200, 12, `Reference ${seed}. No private information is present.`);
    content += "0.8 0.9 0.9 rg 60 140 400 80 re f\n";
  } else {
    content += `q ${width - 72} 0 0 500 36 160 cm /Im0 Do Q\n`;
    text(36, 110, 11, `Illustration ${seed}. Synthetic gradients, shapes and edges.`);
  }
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> ${category === 3 ? "/XObject << /Im0 6 0 R >>" : ""} >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`];
  if (category === 3) {
    const pixels = Buffer.alloc(256 * 256 * 3);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) pixels.set([(x + seed) % 256, (y * 3 + seed) % 256, ((x ^ y) + seed * 7) % 256], (y * 256 + x) * 3);
    const compressed = deflateSync(pixels);
    objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 256 /Height 256 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`), compressed, Buffer.from("\nendstream")]));
  }
  const chunks = [Buffer.from("%PDF-1.7\n")], offsets = [0];
  let position = chunks[0].length;
  objects.forEach((object, index) => { offsets.push(position); const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(object), Buffer.from("\nendobj\n")]); chunks.push(chunk); position += chunk.length; });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
