import { describe, expect, it } from "vitest";
import { extractPdfText, MAX_PDF_PAGES, PdfTooSlowError } from "./pdf";
import { makeTestPdf, makeTestPdfPages } from "./test-pdf";

const numberedPages = (count: number) => Array.from({ length: count }, (_, index) => [`Page ${index + 1}`]);

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

  it("gives up on a PDF that takes too long to read, even in the middle of a page", async () => {
    // One page with 100,000 lines takes PDF.js a few seconds to read.
    const slow = makeTestPdf(Array.from({ length: 100_000 }, (_, index) => `Line ${index}`));
    const started = performance.now();

    await expect(extractPdfText(slow, { timeLimitMs: 50 })).rejects.toBeInstanceOf(PdfTooSlowError);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
