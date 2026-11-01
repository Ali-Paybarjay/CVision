import { describe, expect, it } from "vitest";
import { getAiProvider } from "@/shared/ai";
import { draftFromExtraction } from "../review-draft";
import { extractProfile } from "./extract-profile";
import { buildVariantPdf, variants } from "./four-job-variants";
import { readCvText } from "./read-cv";

// Probe for card #236 (never merged): real requests to the model, so they cost money (one request per run).
// For each variant, prints what the review page would show under each job: «What you did» and «Results and
// achievements», and any line of the CV that ended up under the wrong job or nowhere. Fictional data only.

const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/[.;]$/, "").trim();

/** Two runs where the model's answer may vary, one where the CV leaves it no choice. */
const runs = variants.flatMap((variant) =>
  Array.from({ length: variant.name === "design-tool" || variant.name === "long" ? 2 : 1 }, (_, index) => ({
    label: `${variant.name}, run ${index + 1}`,
    variant,
  })),
);

describe.skipIf(!getAiProvider())("profile-extract on CVs shaped like the pilot user's (card #236 probe)", () => {
  it.each(runs)("$label", async ({ label, variant }) => {
    const { text } = await readCvText({ name: `${variant.name}.pdf`, bytes: await buildVariantPdf(variant) });
    const extraction = await extractProfile(text);
    const draft = draftFromExtraction(extraction);

    const report: string[] = [`=== ${label}: ${variant.tries}`, `jobs read: ${extraction.experience.length}`];
    const placed = extraction.experience.map((job) => [...job.duties, ...job.achievements].map(normalise));
    variant.jobs.forEach((job, index) => {
      const read = draft.experience[index]?.value;
      const whatYouDid = read?.duties ? read.duties.split("\n") : [];
      const results = read?.achievements ? read.achievements.split("\n") : [];
      report.push(
        `job ${index + 1} (${job.title}) read as "${read?.title ?? "—"}": What you did ${whatYouDid.length} lines, Results ${results.length} lines`,
        ...whatYouDid.map((line) => `    did: ${line}`),
        ...results.map((line) => `    result: ${line}`),
      );
      for (const line of [...job.lines, ...job.achievements]) {
        const where = placed.findIndex((lines) => lines.includes(normalise(line)));
        if (where === -1) report.push(`    MISSING: ${line}`);
        else if (where !== index) report.push(`    UNDER JOB ${where + 1}: ${line}`);
      }
    });
    console.log(report.join("\n"));

    expect(extraction.experience.length).toBeGreaterThan(0);
  });
});
