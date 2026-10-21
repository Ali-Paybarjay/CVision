// Test helper: PDFs with the given lines in Helvetica, built by hand,
// so the PDF tests need no fixture files. Text must be plain ASCII or Latin-1 (e.g. "£").

/** A one-page PDF. */
export function makeTestPdf(lines: string[]): Uint8Array {
  return makeTestPdfPages([lines]);
}

/** A PDF with one page for each list of lines. */
export function makeTestPdfPages(pages: string[][]): Uint8Array {
  const escape = (text: string) => text.replace(/[\\()]/g, (character) => `\\${character}`);
  const content = (lines: string[]) =>
    lines.length ? `BT /F1 11 Tf 72 770 Td 15 TL ${lines.map((line) => `(${escape(line)}) Tj T*`).join(" ")} ET` : "";

  // Objects 1 to 3 are the catalogue, the page list and the font; then each page and its content.
  const pageId = (index: number) => 4 + index * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ...pages.flatMap((lines, index) => {
      const stream = content(lines);
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(index) + 1} 0 R >>`,
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
