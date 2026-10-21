import "server-only";
import { readZip, ZipError } from "./zip";

const DOCUMENT = "word/document.xml";
/** Many CV templates put the name and contact details in the page header. */
const HEADER = /^word\/header\d*\.xml$/;
const MAX_PART_BYTES = 10 * 1024 * 1024;

/** Reads the text of a Word (.docx) file: its page headers first, then the body. */
export function extractDocxText(bytes: Uint8Array): string {
  const parts = readZip(bytes, {
    include: (name) => name === DOCUMENT || HEADER.test(name),
    maxEntryBytes: MAX_PART_BYTES,
  });

  const body = parts.get(DOCUMENT);
  if (!body) {
    throw new ZipError("This is not a Word document.");
  }

  const decoder = new TextDecoder();
  const headers = [...parts.keys()]
    .filter((name) => name !== DOCUMENT)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => wordXmlToText(decoder.decode(parts.get(name))));

  // The first-page and default headers often repeat each other.
  const uniqueHeaders = [...new Set(headers.filter(Boolean))];
  return [...uniqueHeaders, wordXmlToText(decoder.decode(body))].filter(Boolean).join("\n\n");
}

// Paragraph start (and whether it closes itself), paragraph end, list marker, text, tab and breaks.
const TOKEN =
  /<w:p(?=[\s>/])[^>]*?(\/)?>|<\/w:p>|<w:numPr>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr|noBreakHyphen)\b[^>]*\/>/g;

/** Turns WordprocessingML into plain text: one line per paragraph, "• " before list items. */
export function wordXmlToText(xml: string): string {
  const cleaned = xml
    // Text boxes are stored twice (a modern copy and a fallback copy); keep one.
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "")
    // Field codes such as HYPERLINK "mailto:…"; the visible result is kept.
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    // Tab stop settings use the same <w:tab> tag as real tabs.
    .replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, "");

  const lines: string[] = [];
  let paragraph = "";
  let isListItem = false;

  const finishParagraph = () => {
    const text = paragraph.replace(/ {2,}/g, " ").trim();
    if (text) lines.push(isListItem ? `• ${text}` : text);
    paragraph = "";
    isListItem = false;
  };

  for (const [tag, selfClosing, text, empty] of cleaned.matchAll(TOKEN)) {
    if (text !== undefined) {
      paragraph += decodeXmlEntities(text);
    } else if (empty === "tab") {
      paragraph += "\t";
    } else if (empty === "br" || empty === "cr") {
      paragraph += "\n";
    } else if (empty === "noBreakHyphen") {
      paragraph += "-";
    } else if (tag === "<w:numPr>") {
      isListItem = true;
    } else {
      // A paragraph starts or ends. An empty, self-closing paragraph adds nothing.
      finishParagraph();
      if (selfClosing) finishParagraph();
    }
  }
  finishParagraph();

  return lines.join("\n");
}

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXmlEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (entity, name: string) => {
    if (name.startsWith("#x")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return NAMED_ENTITIES[name] ?? entity;
  });
}
