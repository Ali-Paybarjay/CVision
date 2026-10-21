import "server-only";
import { getDocumentProxy } from "unpdf";

/** A CV is one to three pages; reading more only adds cost. */
export const MAX_PDF_PAGES = 5;
/** Reading a real CV takes well under a second. A PDF that takes this long was built to be slow. */
export const PDF_TIME_LIMIT_MS = 15_000;

/** Reading the PDF ran out of time. */
export class PdfTooSlowError extends Error {
  constructor() {
    super("Reading the PDF took too long.");
    this.name = "PdfTooSlowError";
  }
}

type ExtractPdfOptions = {
  /** Stop once the text is longer than this. */
  maxCharacters?: number;
  /** Give up after this long, even in the middle of a page. */
  timeLimitMs?: number;
};

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof getDocumentProxy>>["getPage"]>>;
type TextChunk = { items: Array<{ str?: string; hasEOL?: boolean }> };

/** Reads the text of a PDF, page by page, keeping its line breaks. */
export async function extractPdfText(bytes: Uint8Array, options: ExtractPdfOptions = {}): Promise<string> {
  const { maxCharacters = Number.POSITIVE_INFINITY, timeLimitMs = PDF_TIME_LIMIT_MS } = options;
  const deadline = Date.now() + timeLimitMs;
  // PDF.js may take over the buffer it is given, so it gets a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { stopAtErrors: false });

  try {
    const pages: string[] = [];
    let length = 0;
    const lastPage = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let pageNumber = 1; pageNumber <= lastPage && length <= maxCharacters; pageNumber++) {
      if (Date.now() > deadline) throw new PdfTooSlowError();
      const page = await pdf.getPage(pageNumber);
      const text = await readPageText(page, { maxCharacters: maxCharacters - length, deadline });
      pages.push(text);
      length += text.length;
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/**
 * Reads one page's text in the chunks PDF.js sends while it works through the page, so a page built to be
 * slow or huge is stopped part-way. A timer could not do this: PDF.js runs on this thread, and the timer
 * would only fire once the whole page was read.
 */
async function readPageText(page: PdfPage, limits: { maxCharacters: number; deadline: number }): Promise<string> {
  const reader = page.streamTextContent().getReader();
  let text = "";
  try {
    for (;;) {
      const { value, done } = (await reader.read()) as ReadableStreamReadResult<TextChunk>;
      if (done) return text;
      text += value.items.map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join("");
      if (Date.now() > limits.deadline) throw new PdfTooSlowError();
      if (text.length > limits.maxCharacters) return text;
    }
  } finally {
    // Tells PDF.js to stop working on the rest of the page. Nothing to stop once the page is finished.
    // PDF.js needs an Error as the reason: without one it never marks the stream closed, and the page's
    // last message then closes it a second time, which throws outside this code.
    reader.cancel(new Error("Stopped reading the page.")).catch(() => {});
  }
}
