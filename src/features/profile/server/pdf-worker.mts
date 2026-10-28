// The thread pdf.ts starts for each PDF: it reads the text and posts it back once. If the PDF was built to be
// slow or huge, pdf.ts ends this thread, and the server's own thread never waits on PDF.js.
// The tests run this file in Node.js as it is, so it imports only Node.js and unpdf (and types), and it is .mts,
// not .ts, so Node.js loads it as a module without a warning. The build bundles it as its own entry.
import { parentPort, workerData } from "node:worker_threads";
import { getDocumentProxy } from "unpdf";
import type { PdfJob, PdfResult } from "./pdf";

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof getDocumentProxy>>["getPage"]>>;
type TextChunk = { items: Array<{ str?: string; hasEOL?: boolean }> };

void main();

async function main() {
  let result: PdfResult;
  try {
    result = { ok: true, text: await readPdf(workerData as PdfJob) };
  } catch (error) {
    result =
      error instanceof Error
        ? { ok: false, name: error.name, message: error.message }
        : { ok: false, name: "Error", message: String(error) };
  }
  parentPort?.postMessage(result);
}

async function readPdf({ bytes, maxPages, maxCharacters }: PdfJob): Promise<string> {
  const pdf = await getDocumentProxy(bytes, { stopAtErrors: false });
  try {
    const pages: string[] = [];
    let length = 0;
    const lastPage = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= lastPage && length <= maxCharacters; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const text = await readPageText(page, maxCharacters - length);
      pages.push(text);
      length += text.length;
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** Reads one page's text in the chunks PDF.js sends while it works through the page, so a huge page stops part-way. */
async function readPageText(page: PdfPage, maxCharacters: number): Promise<string> {
  const reader = page.streamTextContent().getReader();
  let text = "";
  try {
    for (;;) {
      const { value, done } = (await reader.read()) as ReadableStreamReadResult<TextChunk>;
      if (done) return text;
      text += value.items.map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join("");
      if (text.length > maxCharacters) return text;
    }
  } finally {
    // Tells PDF.js to stop working on the rest of the page. Nothing to stop once the page is finished.
    // PDF.js needs an Error as the reason: without one it never marks the stream closed, and the page's
    // last message then closes it a second time, which throws outside this code.
    reader.cancel(new Error("Stopped reading the page.")).catch(() => {});
  }
}
