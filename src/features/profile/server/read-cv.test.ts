import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cvFileMessages } from "../cv-limits";
import { extractPdfText, PdfOutOfMemoryError, PdfTooSlowError } from "./pdf";
import { cleanCvText, CvFileError, detectCvFormat, MAX_CV_BYTES, MAX_CV_CHARACTERS, readCvText } from "./read-cv";
import { makePasswordProtectedTestPdf, makeTestPdf } from "./test-pdf";
import { writeZip } from "./zip";

// The real PDF reader, which a test can make fail once.
vi.mock("./pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pdf")>();
  return { ...actual, extractPdfText: vi.fn(actual.extractPdfText) };
});

const sampleCv = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "sample-data", "cvs", `${name}.docx`)));
const oleHeader = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

async function failure(file: { name: string; bytes: Uint8Array }): Promise<CvFileError> {
  try {
    await readCvText(file);
  } catch (error) {
    if (error instanceof CvFileError) return error;
    throw error;
  }
  throw new Error("Expected readCvText to fail");
}

describe("readCvText", () => {
  it("reads a Word CV", async () => {
    const cv = await readCvText({ name: "sara.docx", bytes: sampleCv("sara") });

    expect(cv.format).toBe("docx");
    expect(cv.truncated).toBe(false);
    expect(cv.text).toContain("Sara Khan");
    expect(cv.text).toContain("Data Analyst Intern");
  });

  it("reads a PDF CV, whatever the file is called", async () => {
    const pdf = makeTestPdf([
      "Daniel Brooks",
      "Store Manager, Hartley's Home Stores, Birmingham",
      "Run a store with 45 staff and a turnover of 9 million pounds a year",
    ]);

    const cv = await readCvText({ name: "my cv (final).txt", bytes: pdf });

    expect(cv.format).toBe("pdf");
    expect(cv.text).toContain("Daniel Brooks");
  });

  it("refuses an empty file", async () => {
    expect((await failure({ name: "cv.pdf", bytes: new Uint8Array() })).code).toBe("empty");
  });

  it("refuses a file over the size limit", async () => {
    expect((await failure({ name: "cv.pdf", bytes: new Uint8Array(MAX_CV_BYTES + 1) })).code).toBe("too-large");
  });

  it("asks for a newer format for an old .doc file", async () => {
    const error = await failure({ name: "cv.doc", bytes: oleHeader });
    expect(error.code).toBe("wrong-type");
    expect(error.message).toBe(cvFileMessages.oldWord);
  });

  it("recognises a password-protected Word file", async () => {
    expect((await failure({ name: "cv.docx", bytes: oleHeader })).code).toBe("password");
  });

  it("refuses other kinds of file", async () => {
    expect((await failure({ name: "cv.txt", bytes: new TextEncoder().encode("Plain text CV") })).code).toBe("wrong-type");
  });

  it("refuses a ZIP file that is not a Word document", async () => {
    const zip = writeZip([{ name: "photo.txt", data: "not a CV" }]);
    expect((await failure({ name: "cv.docx", bytes: zip })).code).toBe("unreadable");
  });

  it("explains when a PDF has no text, such as a scanned image", async () => {
    expect((await failure({ name: "scan.pdf", bytes: makeTestPdf([]) })).code).toBe("no-text");
  });

  it("recognises a password-protected PDF", async () => {
    expect((await failure({ name: "cv.pdf", bytes: makePasswordProtectedTestPdf() })).code).toBe("password");
  });

  it("asks for another file when a PDF takes too long or needs far too much memory to read", async () => {
    for (const problem of [new PdfTooSlowError(), new PdfOutOfMemoryError()]) {
      vi.mocked(extractPdfText).mockRejectedValueOnce(problem);

      const error = await failure({ name: "cv.pdf", bytes: makeTestPdf(["Emma Walsh"]) });

      expect(error.code).toBe("too-slow");
      expect(error.message).toBe(cvFileMessages.tooSlow);
    }
  });

  it("refuses a damaged PDF", async () => {
    const code = (await failure({ name: "cv.pdf", bytes: new TextEncoder().encode("%PDF-1.7\nthis is not really a PDF") })).code;
    expect(["unreadable", "no-text"]).toContain(code);
  });

  it("keeps only the start of a very long CV and says so", async () => {
    const line = (index: number) =>
      `<w:p><w:r><w:t>Line ${index}: Supervised the fresh food department and its team of eight.</w:t></w:r></w:p>`;
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${Array.from({ length: 800 }, (_, index) => line(index)).join("")}</w:body></w:document>`;

    const cv = await readCvText({ name: "long.docx", bytes: writeZip([{ name: "word/document.xml", data: xml }]) });

    expect(cv.truncated).toBe(true);
    expect(cv.text.length).toBe(MAX_CV_CHARACTERS);
    expect(cv.text.startsWith("Line 0:")).toBe(true);
  });
});

describe("detectCvFormat", () => {
  it("tells the format from the first bytes", () => {
    expect(detectCvFormat(makeTestPdf(["x"]))).toBe("pdf");
    expect(detectCvFormat(writeZip([{ name: "a", data: "b" }]))).toBe("docx");
    expect(detectCvFormat(oleHeader)).toBe("office-legacy");
    expect(detectCvFormat(new TextEncoder().encode("hello"))).toBeNull();
  });
});

describe("cleanCvText", () => {
  it("removes invisible characters and splits ligatures", () => {
    expect(cleanCvText("Ofﬁce​ manager­")).toBe("Office manager");
  });

  it("turns non-breaking and repeated spaces into one space", () => {
    expect(cleanCvText("Store Manager   at  Hartley's")).toBe("Store Manager at Hartley's");
  });

  it("keeps tabs between words but trims each line", () => {
    expect(cleanCvText("  Store Manager \t\t 2016  \r\n")).toBe("Store Manager\t2016");
  });

  it("leaves at most one empty line between blocks", () => {
    expect(cleanCvText("Profile\n\n\n\n\nSkills")).toBe("Profile\n\nSkills");
  });
});
