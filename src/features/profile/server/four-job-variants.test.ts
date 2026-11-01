import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildVariantPdf, variants } from "./four-job-variants";
import { readCvText } from "./read-cv";

// Probe for card #236 (never merged): what text the app's own PDF reader gives the model for each variant.
// Free, no model. To look at the files and the text: PROBE_OUT=<folder> npx vitest run <this file>

const out = process.env.PROBE_OUT;

describe.each(variants)("$name", (variant) => {
  it("reads into text with every job in order", async () => {
    const bytes = await buildVariantPdf(variant);
    const { text } = await readCvText({ name: `${variant.name}.pdf`, bytes });
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${variant.name}.pdf`), bytes);
      writeFileSync(join(out, `${variant.name}.txt`), `${pages} pages\n\n${text}\n`);
    }

    const starts = variant.jobs.map((job) => text.indexOf(job.title));
    expect(starts.every((start, index) => start > (starts[index - 1] ?? -1))).toBe(true);
  });
});

it("design-tool: page 2 gives the lines of jobs 3 and 4 only after the education and certificates", async () => {
  const variant = variants.find((each) => each.name === "design-tool")!;
  const { text } = await readCvText({ name: "design-tool.pdf", bytes: await buildVariantPdf(variant) });
  const certificates = text.indexOf("CERTIFICATIONS");
  expect(text.indexOf(variant.jobs[3].title)).toBeLessThan(certificates);
  expect(text.indexOf(variant.jobs[2].lines[0])).toBeGreaterThan(certificates);
});
