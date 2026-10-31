import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAiProvider } from "@/shared/ai";
import { extractProfile } from "./extract-profile";
import { fourJobCvFileNames, fourJobProfile } from "./four-job-cv";
import { readCvText } from "./read-cv";

// Prompt evals for prompts/profile-extract.md on the four-job CV (card #236): real requests to the model, so they
// cost money. Run with `npm run eval` (needs ANTHROPIC_API_KEY or OPENROUTER_API_KEY).
// A pilot user's four-job CV came back with "What you did" empty for jobs 3 and 4. These check that the model
// keeps the older jobs' lines, under the right job, in both the PDF and the Word file.

const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/[.;]$/, "").trim();

describe.skipIf(!getAiProvider())("profile-extract on the four-job CV", () => {
  describe.each(["pdf", "docx"] as const)("%s", (format) => {
    const expected = fourJobProfile.experience;
    // One model call per file, made by the first test that needs it (never while tests are being collected).
    let reading: Promise<Awaited<ReturnType<typeof extractProfile>>> | undefined;
    const profile = () =>
      (reading ??= (async () => {
        const name = fourJobCvFileNames[format];
        const bytes = new Uint8Array(readFileSync(join(process.cwd(), "sample-data", "cvs", name)));
        return extractProfile((await readCvText({ name, bytes })).text);
      })());

    it("reads all four jobs, newest first", async () => {
      const { experience } = await profile();
      expect(experience.map((job) => normalise(job.title))).toEqual(expected.map((job) => normalise(job.title)));
    });

    it("fills «What you did» for every job, the older ones too", async () => {
      const { experience } = await profile();
      experience.forEach((job, index) => expect(job.duties, `job ${index + 1}, ${job.title}`).not.toHaveLength(0));
    });

    it("keeps each line under its own job", async () => {
      const { experience } = await profile();
      expected.forEach((job, index) => {
        const read = [...(experience[index]?.duties ?? []), ...(experience[index]?.achievements ?? [])].map(normalise);
        for (const line of [...job.duties, ...job.achievements]) {
          expect(read, `job ${index + 1}, ${job.title}`).toContain(normalise(line));
        }
      });
    });
  });
});
