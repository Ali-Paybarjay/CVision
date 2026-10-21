import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf";
import { makeTestPdf } from "./test-pdf";

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
});
