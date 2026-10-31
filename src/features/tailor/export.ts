// The PDF and Word downloads of the tailored CV and the cover letter. Pure code: no browser, no network.
// The layout of docs/tailor-templates, with plain headings and real text, so applicant tracking systems read the file as the user does.
// The Fit highlight is for the preview only and never reaches the file.
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { brand } from "@/shared/brand";
import type { LetterHead } from "./letter-state";
import { cvHeadings, type CvLine, type TailoredCv } from "./tailored-cv";

export type ExportFormat = "pdf" | "docx";
export type ExportDocument = "cv" | "cover-letter";

/** One block of the file, the same for PDF and Word. `label` is printed in bold before the text. */
export type Block =
  | { kind: "name"; text: string; /** Contact details, on the same line as the name when they fit. */ right?: string }
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "organisation"; text: string }
  | { kind: "role"; text: string }
  | { kind: "dates"; text: string }
  | { kind: "skills"; text: string; right?: string }
  | { kind: "bullet"; text: string; label?: string }
  | { kind: "line"; text: string; label?: string }
  | { kind: "letterName"; text: string }
  | { kind: "letterContact"; text: string }
  | { kind: "letterDate"; text: string }
  | { kind: "text"; text: string };

export const mimeTypes: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The CV in the template's order: main skills in two columns, then education, experience, and certificates with other skills last. */
export function cvBlocks(cv: TailoredCv): Block[] {
  const bullets = (lines: CvLine[]): Block[] => lines.map((line) => ({ kind: "bullet", text: line.text, label: line.label }));
  const half = Math.ceil(cv.skills.length / 2);

  return [
    { kind: "name", text: cv.fullName, right: cv.contact.join(" | ") || undefined },
    ...(cv.summary ? [{ kind: "heading" as const, text: cvHeadings.summary }, { kind: "text" as const, text: cv.summary.text }] : []),
    ...(cv.skills.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.skills }] : []),
    ...cv.skills.slice(0, half).map((line, index): Block => ({ kind: "skills", text: line.text, right: cv.skills[half + index]?.text })),
    ...(cv.education.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.education }] : []),
    ...cv.education.map((line): Block => ({ kind: "line", text: line.text, label: line.label })),
    ...(cv.experience.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.experience }] : []),
    ...cv.experience.flatMap((job): Block[] => [
      { kind: "organisation", text: job.company.toUpperCase() },
      ...(job.dates ? [{ kind: "dates" as const, text: job.dates }] : []),
      { kind: "role", text: job.title },
      ...bullets(job.lines),
    ]),
    ...(cv.certifications.length + cv.technicalSkills.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.other }] : []),
    ...(cv.certifications.length > 0 ? [{ kind: "subheading" as const, text: cvHeadings.certificates }] : []),
    ...bullets(cv.certifications),
    ...(cv.technicalSkills.length > 0
      ? [{ kind: "line" as const, label: cvHeadings.technical, text: cv.technicalSkills.map((line) => line.text).join(", ") }]
      : []),
  ];
}

/** The approved cover letter under its letterhead, one block per paragraph; a line break inside a paragraph stays a line break. */
export function letterBlocks(text: string, head?: LetterHead): Block[] {
  const body = text
    .split(/\n\s*\n/)
    .flatMap((paragraph) => paragraph.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): Block => ({ kind: "text", text: line }));
  if (!head) return body;
  return [
    { kind: "letterName", text: head.fullName },
    ...head.contact.map((line): Block => ({ kind: "letterContact", text: line })),
    { kind: "letterDate", text: head.date },
    ...body,
  ];
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

/** The brand's Teal for CV section headings (5.5:1 on white). Decoration only: the heading reads the same without it. */
const teal = { hex: "167480", rgb: rgb(0x16 / 255, 0x74 / 255, 0x80 / 255) };

// ---- PDF -----------------------------------------------------------------

const page = { width: 595.28, height: 841.89, margin: 56 };

const pdfStyle: Record<Block["kind"], { size: number; bold: boolean; before: number; indent: number; align?: "center" | "right" }> = {
  name: { size: 18, bold: true, before: 0, indent: 0 },
  heading: { size: 12, bold: true, before: 16, indent: 0 },
  subheading: { size: 10.5, bold: false, before: 8, indent: 0 },
  organisation: { size: 10.5, bold: false, before: 10, indent: 0 },
  dates: { size: 10.5, bold: false, before: 1, indent: 0 },
  role: { size: 10.5, bold: true, before: 1, indent: 0 },
  skills: { size: 10.5, bold: true, before: 3, indent: 12 },
  bullet: { size: 10.5, bold: false, before: 3, indent: 12 },
  line: { size: 10.5, bold: false, before: 4, indent: 0 },
  letterName: { size: 13, bold: true, before: 0, indent: 0, align: "center" },
  letterContact: { size: 10.5, bold: false, before: 2, indent: 0, align: "center" },
  letterDate: { size: 10.5, bold: false, before: 8, indent: 0, align: "right" },
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
  return [meta.author, ...blocks.flatMap((block) => [block.text, "right" in block ? (block.right ?? "") : "", "label" in block ? (block.label ?? "") : ""])].some((text) => Array.from(text).some((char) => pdfChar(char) === null));
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
    const label = "label" in block && block.label ? `${pdfSafe(block.label)} ` : "";
    y -= style.before;

    if (block.kind === "name") {
      const name = pdfSafe(block.text);
      const contact = pdfSafe(block.right ?? "");
      const contactWidth = regular.widthOfTextAtSize(contact, 9.5);
      y -= style.size;
      current.drawText(name, { x: page.margin, y, size: style.size, font });
      if (contact && bold.widthOfTextAtSize(name, style.size) + contactWidth + 16 <= lineWidth) {
        current.drawText(contact, { x: page.width - page.margin - contactWidth, y, size: 9.5, font: regular });
      } else if (contact) {
        for (const line of wrap(contact, regular, 9.5, lineWidth)) {
          y -= 13;
          current.drawText(line, { x: page.margin, y, size: 9.5, font: regular });
        }
      }
      y -= 7;
      current.drawLine({ start: { x: page.margin, y }, end: { x: page.width - page.margin, y }, thickness: 0.5 });
      continue;
    }

    if (block.kind === "skills") {
      if (y - leading < page.margin) {
        current = pdf.addPage([page.width, page.height]);
        y = page.height - page.margin;
      }
      y -= style.size;
      [block.text, block.right].forEach((text, column) => {
        if (!text) return;
        const x = page.margin + (column * lineWidth) / 2;
        current.drawText("•", { x: x + 2, y, size: style.size, font: regular });
        current.drawText(pdfSafe(text), { x: x + indent, y, size: style.size, font });
      });
      y -= leading - style.size;
      continue;
    }

    // Bold is wider, so a line with a label is measured in bold and never runs past the margin.
    const lines = wrap(label + pdfSafe(block.text), label ? bold : font, style.size, lineWidth - indent);

    lines.forEach((line, index) => {
      // A heading never sits alone at the foot of a page.
      const needed = block.kind === "heading" || block.kind === "organisation" ? leading * 3 : leading;
      if (y - needed < page.margin) {
        current = pdf.addPage([page.width, page.height]);
        y = page.height - page.margin;
      }
      y -= style.size;
      const width = font.widthOfTextAtSize(line, style.size);
      const x = style.align === "center" ? (page.width - width) / 2 : style.align === "right" ? page.width - page.margin - width : page.margin + indent;
      if (block.kind === "bullet" && index === 0) current.drawText("•", { x: page.margin + 2, y, size: style.size, font: regular });
      if (label && index === 0 && line.startsWith(label)) {
        current.drawText(label, { x, y, size: style.size, font: bold });
        current.drawText(line.slice(label.length), { x: x + bold.widthOfTextAtSize(label, style.size), y, size: style.size, font });
      } else {
        current.drawText(line, { x, y, size: style.size, font, color: block.kind === "heading" ? teal.rgb : undefined });
      }
      y -= leading - style.size;
    });
  }

  return pdf.save();
}

// ---- Word ----------------------------------------------------------------

/** The width between the margins of the A4 page below, in the unit Word uses for tab stops. */
const docxLineWidth = 11906 - 1134 * 2;

function labelled(block: { text: string; label?: string }): TextRun[] {
  return [...(block.label ? [new TextRun({ text: `${block.label} `, bold: true })] : []), new TextRun(block.text)];
}

function blockToParagraph(block: Block): Paragraph {
  switch (block.kind) {
    case "name": {
      // About 100 small letters fit on the line, and a letter of the name is twice as wide.
      const fits = block.text.length * 2 + (block.right?.length ?? 0) <= 96;
      return new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 120 },
        border: { bottom: { style: "single", size: 4, color: "auto", space: 4 } },
        tabStops: [{ type: TabStopType.RIGHT, position: docxLineWidth }],
        children: [
          new TextRun({ text: block.text, bold: true, size: 36 }),
          ...(block.right ? [new TextRun({ text: fits ? `\t${block.right}` : block.right, size: 19, break: fits ? undefined : 1 })] : []),
        ],
      });
    }
    case "heading":
      return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 80 }, children: [new TextRun({ text: block.text, bold: true, size: 24, color: teal.hex })] });
    case "subheading":
      return new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: block.text, italics: true })] });
    case "organisation":
      return new Paragraph({ spacing: { before: 160 }, children: [new TextRun(block.text)] });
    case "role":
      return new Paragraph({ children: [new TextRun({ text: block.text, bold: true })] });
    case "dates":
      return new Paragraph({ children: [new TextRun(block.text)] });
    case "skills":
      return new Paragraph({
        spacing: { after: 40 },
        tabStops: [{ type: TabStopType.LEFT, position: docxLineWidth / 2 }],
        children: [new TextRun({ text: `• ${block.text}${block.right ? `\t• ${block.right}` : ""}`, bold: true })],
      });
    case "bullet":
      return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: labelled(block) });
    case "line":
      return new Paragraph({ spacing: { after: 60 }, children: labelled(block) });
    case "letterName":
      return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: block.text, bold: true, size: 26 })] });
    case "letterContact":
      return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(block.text)] });
    case "letterDate":
      return new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 160, after: 160 }, children: [new TextRun(block.text)] });
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
