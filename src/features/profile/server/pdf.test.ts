import type { ResourceLimits, Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdfText, MAX_PDF_PAGES, PDF_MEMORY_LIMITS, PdfOutOfMemoryError, PdfTooSlowError } from "./pdf";
import { makePasswordProtectedTestPdf, makeTestPdf, makeTestPdfPages } from "./test-pdf";

// Lets a test give the reading thread less memory than the real limit, to see what happens when it runs out,
// or swap PDF.js for a thread that never finishes, so the time-limit test doesn't depend on how fast the computer is.
const testThread = vi.hoisted(() => ({ limits: undefined as ResourceLimits | undefined, stuck: false }));
vi.mock("node:worker_threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:worker_threads")>();
  class TestWorker extends actual.Worker {
    constructor(...[filename, options]: ConstructorParameters<typeof actual.Worker>) {
      if (testThread.stuck) {
        // Never finishes and never stops to wait, like PDF.js deep inside a page built to be slow.
        super("for (;;) {}", { ...options, eval: true });
      } else {
        super(filename, testThread.limits ? { ...options, resourceLimits: testThread.limits } : options);
      }
    }
  }
  return { ...actual, Worker: TestWorker };
});

const numberedPages = (count: number) => Array.from({ length: count }, (_, index) => [`Page ${index + 1}`]);
/** One page with 100,000 lines: PDF.js needs about 40 MB of memory to read it. */
const bigPdf = () => makeTestPdf(Array.from({ length: 100_000 }, (_, index) => `Line ${index}`));

// Every reading thread started in a test, with the limits it started with, to check none is left running.
let threads: Array<{ worker: Worker; limits: ResourceLimits }> = [];
const onWorker = (worker: Worker) => threads.push({ worker, limits: worker.resourceLimits ?? {} });
beforeEach(() => {
  threads = [];
  process.on("worker", onWorker);
});
afterEach(() => {
  process.off("worker", onWorker);
  testThread.limits = undefined;
  testThread.stuck = false;
});

/** True once every reading thread started in this test has ended. */
const allThreadsEnded = () => threads.length > 0 && threads.every(({ worker }) => worker.threadId === -1);

describe("extractPdfText", () => {
  it("reads each line of a PDF", async () => {
    const pdf = makeTestPdf(["Reza Karimi", "Maths Teacher and Head of Year 9", "Managed a £15,000 budget (trips)"]);

    const text = await extractPdfText(pdf);

    expect(text.split("\n").map((line) => line.trim())).toEqual(
      expect.arrayContaining(["Reza Karimi", "Maths Teacher and Head of Year 9", "Managed a £15,000 budget (trips)"]),
    );
  });

  it("returns no text for a page with none, such as a scanned image", async () => {
    expect((await extractPdfText(makeTestPdf([]))).trim()).toBe("");
  });

  it("does not change the bytes it was given", async () => {
    const pdf = makeTestPdf(["Emma Walsh"]);
    const copy = pdf.slice();

    await extractPdfText(pdf);

    expect(pdf).toEqual(copy);
  });

  it(`reads at most ${MAX_PDF_PAGES} pages`, async () => {
    const text = await extractPdfText(makeTestPdfPages(numberedPages(MAX_PDF_PAGES + 2)));

    expect(text).toContain(`Page ${MAX_PDF_PAGES}`);
    expect(text).not.toContain(`Page ${MAX_PDF_PAGES + 1}`);
  });

  it("stops after the page that gives it enough text", async () => {
    const text = await extractPdfText(makeTestPdfPages(numberedPages(3)), { maxCharacters: 3 });

    expect(text).toContain("Page 1");
    expect(text).not.toContain("Page 2");
  });

  it("reads in its own thread, with a memory limit, and ends the thread once the text is back", async () => {
    await extractPdfText(makeTestPdf(["Daniel Brooks"]));

    expect(threads).toHaveLength(1);
    expect(threads[0].limits.maxOldGenerationSizeMb).toBe(PDF_MEMORY_LIMITS.maxOldGenerationSizeMb);
    expect(allThreadsEnded()).toBe(true);
  });

  it("gives up on a PDF that takes too long to read, even in the middle of a page", async () => {
    testThread.stuck = true;
    const timeLimitMs = 300;
    let serverTicks = 0;
    const ticker = setInterval(() => serverTicks++, 20);
    const started = performance.now();

    await expect(extractPdfText(makeTestPdf(["Sara Khan"]), { timeLimitMs })).rejects.toBeInstanceOf(PdfTooSlowError);
    clearInterval(ticker);
    // The thread is ended as soon as the time is up, though it never stops to wait.
    expect(performance.now() - started).toBeLessThan(timeLimitMs + 1000);
    expect(allThreadsEnded()).toBe(true);
    // Meanwhile the server's own thread was free for other requests.
    expect(serverTicks).toBeGreaterThan(0);
  });

  it("gives up on a PDF that needs far more memory than a CV", async () => {
    testThread.limits = { maxOldGenerationSizeMb: 8 };

    await expect(extractPdfText(bigPdf(), { timeLimitMs: 30_000 })).rejects.toBeInstanceOf(PdfOutOfMemoryError);
    expect(allThreadsEnded()).toBe(true);
  });

  it("keeps the name of an error from PDF.js, so a password-protected PDF is recognised", async () => {
    await expect(extractPdfText(makePasswordProtectedTestPdf())).rejects.toMatchObject({ name: "PasswordException" });
    expect(allThreadsEnded()).toBe(true);
  });
});
