import "server-only";
import { Worker, type ResourceLimits } from "node:worker_threads";

/** A CV is one to three pages; reading more only adds cost. */
export const MAX_PDF_PAGES = 5;
/** Reading a real CV takes well under a second. A PDF that takes this long was built to be slow. */
export const PDF_TIME_LIMIT_MS = 15_000;
/**
 * The memory the reading thread may use. A CV, even with twenty embedded fonts, needs about 20 MB;
 * a PDF built to be huge is stopped here instead of taking memory from everyone else's requests.
 */
export const PDF_MEMORY_LIMITS: ResourceLimits = { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 };

/** Reading the PDF ran out of time. */
export class PdfTooSlowError extends Error {
  constructor() {
    super("Reading the PDF took too long.");
    this.name = "PdfTooSlowError";
  }
}

/** Reading the PDF needed far more memory than any CV. */
export class PdfOutOfMemoryError extends Error {
  constructor() {
    super("Reading the PDF needed too much memory.");
    this.name = "PdfOutOfMemoryError";
  }
}

type ExtractPdfOptions = {
  /** Stop once the text is longer than this. */
  maxCharacters?: number;
  /** Give up after this long, even in the middle of a page. */
  timeLimitMs?: number;
};

/** What the reading thread (pdf-worker.mts) is given. */
export type PdfJob = { bytes: Uint8Array; maxPages: number; maxCharacters: number };
/** What the reading thread posts back. An error keeps its name, so a password-protected PDF is still recognised. */
export type PdfResult = { ok: true; text: string } | { ok: false; name: string; message: string };

/**
 * Reads the text of a PDF, page by page, keeping its line breaks. PDF.js runs in its own thread with a memory limit,
 * and the thread is ended when the time is up, so a PDF built to be slow or huge can't hold up the server.
 */
export async function extractPdfText(bytes: Uint8Array, options: ExtractPdfOptions = {}): Promise<string> {
  const { maxCharacters = Number.POSITIVE_INFINITY, timeLimitMs = PDF_TIME_LIMIT_MS } = options;
  // The thread is handed its own copy: PDF.js may take over the buffer, and the caller keeps its bytes.
  const copy = new Uint8Array(bytes);
  const job: PdfJob = { bytes: copy, maxPages: MAX_PDF_PAGES, maxCharacters };
  const worker = new Worker(new URL("./pdf-worker.mts", import.meta.url), {
    workerData: job,
    transferList: [copy.buffer],
    resourceLimits: PDF_MEMORY_LIMITS,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new PdfTooSlowError()), timeLimitMs);
      worker.once("message", (result: PdfResult) => {
        if (result.ok) resolve(result.text);
        else reject(Object.assign(new Error(result.message), { name: result.name }));
      });
      // `on`, not `once`: an "error" event with no listener would bring down the whole server.
      worker.on("error", (error: Error & { code?: string }) => {
        reject(error.code === "ERR_WORKER_OUT_OF_MEMORY" ? new PdfOutOfMemoryError() : error);
      });
      worker.on("messageerror", reject);
      worker.once("exit", () => reject(new Error("The PDF reader stopped before it finished.")));
    });
  } finally {
    clearTimeout(timer);
    // Ends the thread whether it finished, failed or ran out of time. Unlike a timer on this thread,
    // this stops PDF.js wherever it is, even in the middle of a page.
    await worker.terminate();
  }
}
