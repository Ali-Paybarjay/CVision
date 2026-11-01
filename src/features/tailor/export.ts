// The PDF and Word downloads of the tailored CV and the cover letter. Pure code: no browser, no network.
// The layout of docs/tailor-templates, with coloured headings and real text, so applicant tracking systems read the file as the user does.
// The Fit highlight is for the preview only and never reaches the file.
import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TabStopType, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from "pdf-lib";
import { brand } from "@/shared/brand";
import type { LetterHead } from "./letter-state";
import { cvHeadings, otherLines, type CvLine, type TailoredCv } from "./tailored-cv";

export type ExportFormat = "pdf" | "docx";
export type ExportDocument = "cv" | "cover-letter";

/** One block of the file, the same for PDF and Word. `label` is printed in bold before the text. */
export type Block =
  | { kind: "name"; text: string }
  | { kind: "headline"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  /** The role in bold with its dates at the right margin. The text stays in reading order: role, dates, company, then the role's lines. */
  | { kind: "job"; text: string; right?: string }
  | { kind: "company"; text: string }
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

/** The CV in the template's order: skills in two columns, then work experience, education, and certificates and tools last. */
export function cvBlocks(cv: TailoredCv): Block[] {
  const bullets = (lines: CvLine[]): Block[] => lines.map((line) => ({ kind: "bullet", text: line.text, label: line.label }));
  const half = Math.ceil(cv.skills.length / 2);
  const other = otherLines(cv);

  return [
    { kind: "name", text: cv.fullName },
    ...(cv.headline ? [{ kind: "headline" as const, text: cv.headline }] : []),
    ...cv.contact.map((line): Block => ({ kind: "contact", text: line })),
    ...(cv.summary ? [{ kind: "heading" as const, text: cvHeadings.summary }, { kind: "text" as const, text: cv.summary.text }] : []),
    ...(cv.skills.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.skills }] : []),
    ...cv.skills.slice(0, half).map((line, index): Block => ({ kind: "skills", text: line.text, right: cv.skills[half + index]?.text })),
    ...(cv.experience.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.experience }] : []),
    ...cv.experience.flatMap((job): Block[] => [
      { kind: "job", text: job.title, right: job.dates || undefined },
      { kind: "company", text: job.company },
      ...bullets(job.lines),
    ]),
    ...(cv.education.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.education }] : []),
    ...cv.education.map((line): Block => ({ kind: "line", text: line.text, label: line.label })),
    ...(other.length > 0 ? [{ kind: "heading" as const, text: cvHeadings.other }] : []),
    ...other.map((line): Block => ({ kind: "line", text: line.text, label: line.label })),
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

type Meta = { title: string; author: string; /** Printed at the foot of every page with the page number. */ footer?: string };

export async function blocksToFile(blocks: Block[], format: ExportFormat, meta: Meta): Promise<Uint8Array> {
  return format === "pdf" ? blocksToPdf(blocks, meta) : blocksToDocx(blocks, meta);
}

/** The brand's Teal for CV section headings (5.5:1 on white). Decoration only: the heading reads the same without it. */
const teal = { hex: "167480", rgb: rgb(0x16 / 255, 0x74 / 255, 0x80 / 255) };
/** Secondary text: the headline, contact details, dates and company (7.5:1 on white). */
const muted = { hex: "555555", rgb: rgb(0x55 / 255, 0x55 / 255, 0x55 / 255) };
/** The thin rule under a section heading. */
const rule = { hex: "B9CDD1", rgb: rgb(0xb9 / 255, 0xcd / 255, 0xd1 / 255) };

// ---- PDF -----------------------------------------------------------------

const page = { width: 595.28, height: 841.89, margin: 56 };

const pdfStyle: Record<Block["kind"], { size: number; bold: boolean; before: number; indent: number; align?: "center" | "right" }> = {
  name: { size: 22, bold: true, before: 0, indent: 0 },
  headline: { size: 11, bold: true, before: 4, indent: 0 },
  contact: { size: 9.5, bold: false, before: 3, indent: 0 },
  heading: { size: 9.5, bold: true, before: 16, indent: 0 },
  subheading: { size: 10.5, bold: false, before: 8, indent: 0 },
  job: { size: 10.5, bold: true, before: 10, indent: 0 },
  company: { size: 10, bold: false, before: 1, indent: 0 },
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

    if (block.kind === "job") {
      // The role, its company and its first line stay together on one page.
      if (y - leading * 3 - style.size < page.margin) {
        current = pdf.addPage([page.width, page.height]);
        y = page.height - page.margin;
      }
      const dates = pdfSafe(block.right ?? "");
      const datesWidth = regular.widthOfTextAtSize(dates, 9.5);
      wrap(pdfSafe(block.text), bold, style.size, lineWidth - datesWidth - 16).forEach((line, index) => {
        y -= style.size;
        current.drawText(line, { x: page.margin, y, size: style.size, font });
        if (index === 0 && dates) current.drawText(dates, { x: page.width - page.margin - datesWidth, y, size: 9.5, font: regular, color: muted.rgb });
        y -= leading - style.size;
      });
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
      const needed = block.kind === "heading" ? leading * 6 : leading;
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
      } else if (block.kind === "heading") {
        current.pushOperators(setCharacterSpacing(0.8));
        current.drawText(line, { x, y, size: style.size, font, color: teal.rgb });
        current.pushOperators(setCharacterSpacing(0));
        current.drawLine({ start: { x: page.margin, y: y - 4 }, end: { x: page.width - page.margin, y: y - 4 }, thickness: 0.5, color: rule.rgb });
        y -= 5;
      } else {
        const secondary = block.kind === "headline" || block.kind === "contact" || block.kind === "company";
        current.drawText(line, { x, y, size: style.size, font, color: secondary ? muted.rgb : undefined });
      }
      y -= leading - style.size;
    });
  }

  if (meta.footer) {
    const footer = pdfSafe(meta.footer);
    const pages = pdf.getPages();
    pages.forEach((item, index) => {
      const number = `${index + 1} / ${pages.length}`;
      item.drawText(footer, { x: page.margin, y: 30, size: 8, font: regular, color: muted.rgb });
      item.drawText(number, { x: page.width - page.margin - regular.widthOfTextAtSize(number, 8), y: 30, size: 8, font: regular, color: muted.rgb });
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
    case "name":
      return new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 40 }, children: [new TextRun({ text: block.text, bold: true, size: 44 })] });
    case "headline":
      return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: block.text, bold: true, size: 22, color: muted.hex })] });
    case "contact":
      return new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: block.text, size: 19, color: muted.hex })] });
    case "heading":
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { before: 280, after: 80 },
        border: { bottom: { style: "single", size: 4, color: rule.hex, space: 3 } },
        children: [new TextRun({ text: block.text, bold: true, size: 19, color: teal.hex, characterSpacing: 16 })],
      });
    case "subheading":
      return new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: block.text, italics: true })] });
    case "job":
      return new Paragraph({
        keepNext: true,
        spacing: { before: 160 },
        tabStops: [{ type: TabStopType.RIGHT, position: docxLineWidth }],
        children: [new TextRun({ text: block.text, bold: true }), ...(block.right ? [new TextRun({ text: `\t${block.right}`, size: 19, color: muted.hex })] : [])],
      });
    case "company":
      return new Paragraph({ keepNext: true, spacing: { after: 40 }, children: [new TextRun({ text: block.text, size: 20, color: muted.hex })] });
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
        footers: meta.footer
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    tabStops: [{ type: TabStopType.RIGHT, position: docxLineWidth }],
                    children: [new TextRun({ text: `${meta.footer}\t`, size: 16, color: muted.hex }), new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16, color: muted.hex })],
                  }),
                ],
              }),
            }
          : undefined,
        children: blocks.map(blockToParagraph),
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
