// The PDF and Word downloads of the tailored CV and the cover letter. Pure code: no browser, no network.
// One column, plain headings and real text, so applicant tracking systems read the file as the user does.
// The Fit highlight is for the preview only and never reaches the file.
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { brand } from "@/shared/brand";
import type { TailoredCv } from "./tailored-cv";

export type ExportFormat = "pdf" | "docx";
export type ExportDocument = "cv" | "cover-letter";

/** One block of the file, the same for PDF and Word. */
export type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "role"; text: string }
  | { kind: "dates"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string };

export const mimeTypes: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The CV in reading order, with the same headings as the preview. */
export function cvBlocks(cv: TailoredCv): Block[] {
  const list = (heading: string, lines: { text: string }[]): Block[] =>
    lines.length === 0 ? [] : [{ kind: "heading", text: heading }, ...lines.map((line) => ({ kind: "bullet" as const, text: line.text }))];

  return [
    { kind: "name", text: cv.fullName },
    ...(cv.contact.length > 0 ? [{ kind: "contact" as const, text: cv.contact.join(" · ") }] : []),
    ...(cv.summary ? [{ kind: "heading" as const, text: "Professional summary" }, { kind: "text" as const, text: cv.summary.text }] : []),
    ...list("Skills", cv.skills),
    ...(cv.experience.length > 0 ? [{ kind: "heading" as const, text: "Experience" }] : []),
    ...cv.experience.flatMap((job): Block[] => [
      { kind: "role", text: `${job.title}, ${job.company}` },
      ...(job.dates ? [{ kind: "dates" as const, text: job.dates }] : []),
      ...job.lines.map((line) => ({ kind: "bullet" as const, text: line.text })),
    ]),
    ...list("Education", cv.education),
    ...list("Additional information", cv.certifications),
  ];
}

/** The approved cover letter, one block per paragraph; a line break inside a paragraph stays a line break. */
export function letterBlocks(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .flatMap((paragraph) => paragraph.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): Block => ({ kind: "text", text: line }));
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("-")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** "Sara-Ahmadi-CV-Data-Analyst.pdf": the user's name, the document and the job title. */
export function exportFileName(fullName: string, jobTitle: string, document: ExportDocument, format: ExportFormat): string {
  const label = document === "cv" ? "CV" : "Cover-letter";
  return [slug(fullName), label, slug(jobTitle)].filter(Boolean).join("-") + `.${format}`;
}

type Meta = { title: string; author: string };

export async function blocksToFile(blocks: Block[], format: ExportFormat, meta: Meta): Promise<Uint8Array> {
  return format === "pdf" ? blocksToPdf(blocks, meta) : blocksToDocx(blocks, meta);
}

// ---- PDF -----------------------------------------------------------------

const page = { width: 595.28, height: 841.89, margin: 56 };

const pdfStyle: Record<Block["kind"], { size: number; bold: boolean; before: number; indent: number }> = {
  name: { size: 20, bold: true, before: 0, indent: 0 },
  contact: { size: 10, bold: false, before: 4, indent: 0 },
  heading: { size: 12, bold: true, before: 16, indent: 0 },
  role: { size: 11, bold: true, before: 10, indent: 0 },
  dates: { size: 10, bold: false, before: 1, indent: 0 },
  bullet: { size: 10.5, bold: false, before: 3, indent: 12 },
  text: { size: 10.5, bold: false, before: 8, indent: 0 },
};

// The standard PDF fonts only cover Latin text (WinAnsi), so other letters fall back to their plain form.
const winAnsiExtras = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
// Letters with a stroke have no accent to drop, so they are mapped by hand.
const plainLetters: Record<string, string> = { Ł: "L", ł: "l", Đ: "D", đ: "d", Ħ: "H", ħ: "h", ı: "i" };

/** One character as the standard fonts can draw it, or null when they cannot draw it at all. */
function pdfChar(char: string): string | null {
  const code = char.charCodeAt(0);
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || winAnsiExtras.includes(char)) return char;
  if (plainLetters[char]) return plainLetters[char];
  // NFKD also splits ligatures and subscripts from PDF text: "ﬁ" becomes "fi" and "₂" becomes "2".
  const plain = char.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return /^[\x20-\x7e]+$/.test(plain) ? plain : null;
}

/** Text the standard fonts can draw: accents are kept where the font has them and dropped where it does not. */
export function pdfSafe(text: string): string {
  return Array.from(text.replace(/\s+/g, " "))
    .map((char) => pdfChar(char) ?? "?")
    .join("");
}

/** True when the PDF would show some letters of these blocks as "?" (Persian or Cyrillic, for example). */
export function pdfLosesLetters(blocks: Block[], meta: Meta): boolean {
  return [meta.author, ...blocks.map((block) => block.text)].some((text) => Array.from(text).some((char) => pdfChar(char) === null));
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}

async function blocksToPdf(blocks: Block[], meta: Meta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(meta.title));
  pdf.setAuthor(pdfSafe(meta.author));
  pdf.setCreator(brand.name);
  pdf.setProducer(brand.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let current: PDFPage = pdf.addPage([page.width, page.height]);
  let y = page.height - page.margin;
  const lineWidth = page.width - page.margin * 2;

  for (const block of blocks) {
    const style = pdfStyle[block.kind];
    const font = style.bold ? bold : regular;
    const leading = style.size * 1.35;
    const indent = style.indent;
    const lines = wrap(pdfSafe(block.text), font, style.size, lineWidth - indent);
    y -= style.before;

    lines.forEach((line, index) => {
      // A heading never sits alone at the foot of a page.
      const needed = block.kind === "heading" || block.kind === "role" ? leading * 3 : leading;
      if (y - needed < page.margin) {
        current = pdf.addPage([page.width, page.height]);
        y = page.height - page.margin;
      }
      y -= style.size;
      if (block.kind === "bullet" && index === 0) current.drawText("•", { x: page.margin + 2, y, size: style.size, font: regular });
      current.drawText(line, { x: page.margin + indent, y, size: style.size, font });
      y -= leading - style.size;
    });

    if (block.kind === "heading") {
      current.drawLine({ start: { x: page.margin, y: y + 1 }, end: { x: page.width - page.margin, y: y + 1 }, thickness: 0.5 });
      y -= 2;
    }
  }

  return pdf.save();
}

// ---- Word ----------------------------------------------------------------

function blockToParagraph(block: Block): Paragraph {
  switch (block.kind) {
    case "name":
      return new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: block.text, bold: true, size: 40 })] });
    case "contact":
      return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: block.text, size: 20 })] });
    case "heading":
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 80 },
        border: { bottom: { style: "single", size: 4, color: "auto", space: 1 } },
        children: [new TextRun({ text: block.text, bold: true, size: 24 })],
      });
    case "role":
      return new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: block.text, bold: true })] });
    case "dates":
      return new Paragraph({ children: [new TextRun({ text: block.text, size: 20 })] });
    case "bullet":
      return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun(block.text)] });
    case "text":
      return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 160 }, children: [new TextRun(block.text)] });
  }
}

async function blocksToDocx(blocks: Block[], meta: Meta): Promise<Uint8Array> {
  const document = new Document({
    title: meta.title,
    creator: meta.author,
    styles: {
      default: {
        document: { run: { font: "Arial", size: 21, color: "000000" } },
        title: { run: { font: "Arial", color: "000000" } },
        heading1: { run: { font: "Arial", color: "000000" } },
      },
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: blocks.map(blockToParagraph),
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
