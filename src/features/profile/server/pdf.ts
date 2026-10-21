import "server-only";
import { getDocumentProxy } from "unpdf";

/** A CV is one to three pages; reading more only adds cost. */
export const MAX_PDF_PAGES = 10;

/** Reads the text of a PDF, page by page, keeping its line breaks. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // PDF.js may take over the buffer it is given, so it gets a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { stopAtErrors: false });

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PDF_PAGES); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join(""),
      );
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    await pdf.loadingTask.destroy();
  }
}
