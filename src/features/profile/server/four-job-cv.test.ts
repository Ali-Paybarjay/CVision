import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Profile } from "@/shared/contracts";
import { extractDocxText } from "./docx";
import { buildFourJobCvDocx, buildFourJobCvPdf, fourJobCvFileNames, fourJobProfile } from "./four-job-cv";
import { extractPdfText } from "./pdf";
import { readZip } from "./zip";

// Checks the four-job CV in sample-data/cvs (card #236), and that reading it keeps every job's lines with that job.
// After changing four-job-cv.ts, rebuild the files with:
//   WRITE_SAMPLE_CVS=1 npx vitest run src/features/profile/server/four-job-cv.test.ts

const folder = join(process.cwd(), "sample-data", "cvs");
const formats = [
  { format: "pdf", build: buildFourJobCvPdf, read: (bytes: Uint8Array) => extractPdfText(bytes) },
  { format: "docx", build: buildFourJobCvDocx, read: async (bytes: Uint8Array) => extractDocxText(bytes) },
] as const;

if (process.env.WRITE_SAMPLE_CVS === "1") {
  mkdirSync(folder, { recursive: true });
  for (const { format, build } of formats) writeFileSync(join(folder, fourJobCvFileNames[format]), await build());
}

const oneLine = (text: string) => text.replace(/\s+/g, " ");
/** Where a job starts in the text: its title and employer, which no other line repeats. */
const jobStart = (job: Profile["experience"][number]) => `${job.title}, ${job.company}`;

describe.each(formats)("sample-data/cvs/daniel-four-jobs.$format", ({ format, build, read }) => {
  const file = () => new Uint8Array(readFileSync(join(folder, fourJobCvFileNames[format])));

  it("is up to date with four-job-cv.ts", async () => {
    expect(await read(file())).toBe(await read(await build()));
  });

  it("is fictional: example.com email and a 07700 900 drama number", async () => {
    const text = await read(file());
    expect(text).toMatch(/@example\.com/);
    expect(text).toMatch(/07700 900\d{3}/);
  });

  it("gives each job's lines right after that job, before the next one starts", async () => {
    const text = oneLine(await read(file()));
    const jobs = fourJobProfile.experience;
    const starts = jobs.map((job) => text.indexOf(jobStart(job)));
    expect(starts.every((start, index) => start > (starts[index - 1] ?? -1))).toBe(true);

    jobs.forEach((job, index) => {
      const own = text.slice(starts[index], starts[index + 1] ?? text.indexOf("EDUCATION"));
      for (const line of [...job.duties, ...job.achievements]) expect(own).toContain(line);
    });
  });
});

it("puts jobs 3 and 4 on page 2 of the PDF, as in the pilot user's CV", async () => {
  const bytes = new Uint8Array(readFileSync(join(folder, fourJobCvFileNames.pdf)));
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  const text = await extractPdfText(bytes);
  const pageBreak = text.indexOf("Page 1 of 2");
  const [first, second, third, fourth] = fourJobProfile.experience.map((job) => text.indexOf(jobStart(job)));
  expect([first, second].every((start) => start < pageBreak)).toBe(true);
  expect([third, fourth].every((start) => start > pageBreak)).toBe(true);
});

it("starts job 3 on a new page in the Word file", () => {
  const parts = readZip(readFileSync(join(folder, fourJobCvFileNames.docx)), {
    include: (name) => name === "word/document.xml",
    maxEntryBytes: 1024 * 1024,
    maxTotalBytes: 1024 * 1024,
  });
  const paragraphs = new TextDecoder().decode(parts.get("word/document.xml")).split("</w:p>");
  const withPageBreak = paragraphs.filter((paragraph) => paragraph.includes("<w:pageBreakBefore"));
  expect(withPageBreak).toHaveLength(1);
  expect(withPageBreak[0]).toContain(jobStart(fourJobProfile.experience[2]));
});
