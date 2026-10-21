import "server-only";
import { readZip, ZipError } from "./zip";

const DOCUMENT = "word/document.xml";
/**
 * Many CV templates put the name and contact details in the page header.
 * A section has up to three headers (first page, odd and even pages), so six covers two sections.
 */
const HEADER = /^word\/header[1-6]\.xml$/;
/** A CV's document.xml is usually well under 1 MB, even with a heavy template. */
const MAX_PART_BYTES = 5 * 1024 * 1024;
/** The body and the headers together. */
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

/** Reads the text of a Word (.docx) file: its page headers first, then the body. */
export function extractDocxText(bytes: Uint8Array): string {
  const parts = readZip(bytes, {
    include: (name) => name === DOCUMENT || HEADER.test(name),
    maxEntryBytes: MAX_PART_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
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
// Attributes are matched with [^<>], so a tag that never closes stops at the next "<". With [^>] each
// such tag scanned to the end of the text, and a long run of them took quadratic time.
const TOKEN =
  /<w:p(?=[\s>/])[^<>]*?(\/)?>|<\/w:p>|<w:numPr>|<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr|noBreakHyphen)\b[^<>]*\/>/g;

/** Turns WordprocessingML into plain text: one line per paragraph, "• " before list items. */
export function wordXmlToText(xml: string): string {
  // Text boxes are stored twice (a modern copy and a fallback copy); keep one.
  let cleaned = removeElements(xml, "mc:Fallback");
  // Field codes such as HYPERLINK "mailto:…"; the visible result is kept.
  cleaned = removeElements(cleaned, "w:instrText");
  // Tab stop settings use the same <w:tab> tag as real tabs.
  cleaned = removeElements(cleaned, "w:tabs");

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

/**
 * Removes each <tag …>…</tag> element and everything inside it, like
 * replace(/<tag\b[^>]*>[\s\S]*?<\/tag>/g, "") but in linear time: that regex rescans the rest of the
 * text for every opening tag that is never closed.
 */
function removeElements(xml: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let kept = "";
  let copiedUpTo = 0;
  let searchFrom = 0;

  for (;;) {
    const start = xml.indexOf(open, searchFrom);
    if (start === -1) break;
    const tagEnd = xml.indexOf(">", start + open.length);
    if (tagEnd === -1) break;
    searchFrom = tagEnd + 1;
    // "<w:tabs" must not match "<w:tabsX", and a self-closing tag has nothing inside it.
    if (!/[\s/>]/.test(xml[start + open.length]) || xml[tagEnd - 1] === "/") continue;

    const end = xml.indexOf(close, tagEnd + 1);
    // No closing tag after this one, so no later opening tag can be closed either.
    if (end === -1) break;
    kept += xml.slice(copiedUpTo, start);
    copiedUpTo = searchFrom = end + close.length;
  }

  return kept + xml.slice(copiedUpTo);
}

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXmlEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (entity, name: string) => {
    if (name.startsWith("#x")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return NAMED_ENTITIES[name] ?? entity;
  });
}
