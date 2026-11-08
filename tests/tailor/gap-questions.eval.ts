// Live prompt evals for prompts/tailor-gap-questions.md on a long clinical ad (#402): real requests, so they cost money.
// Run with `npm run eval`, or from Actions → eval with tests/tailor/gap-questions.eval.ts.
// The questions and the counts are printed, so a run before and after a prompt change can be compared in the PR.
import { describe, expect, it } from "vitest";
import { parseJob } from "@/features/profile/server/check-job";
import { askGapQuestions } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import { clinicalFixtures } from "./clinical-fixture";

/** On since #397: the job reader keeps the whole person specification (up to 20 + 10). */
const JOB_READER_KEEPS_WHOLE_PERSON_SPEC = true;

/** For each specialist gap, words from the ad that a question someone in the role understands would use. */
const specialistWords: Record<string, string[]> = {
  "clinical-gap-1": ["practice supervisor", "practice assessor", "assessor", "supervisor"],
  "clinical-gap-2": ["shift", "nurse in charge", "in charge", "coordinat"],
  "clinical-gap-3": ["student"],
  "clinical-gap-4": ["triage", "prioriti"],
  "clinical-gap-5": ["safeguarding"],
  "clinical-gap-6": ["clinical governance", "incident"],
  "clinical-gap-7": ["revalidation", "cpd", "professional development"],
  "clinical-gap-10": ["als", "advanced life support"],
  "clinical-gap-11": ["v300", "prescrib", "licence to practise"],
  "clinical-gap-12": ["audit", "quality improvement"],
  "clinical-gap-13": ["venepuncture", "blood gas", "abg"],
  "clinical-gap-14": ["mental capacity"],
};

const conditionGaps = ["clinical-gap-8", "clinical-gap-9"]; // Enhanced DBS check, right to work
const licenceGap = "clinical-gap-11"; // "… with a full licence to practise" (#401)

const words = (text: string) => text.trim().split(/\s+/).length;
const hasAny = (text: string, list: string[]) => list.some((word) => text.toLowerCase().includes(word));

describe.skipIf(!getAiProvider())("Gap questions on a long clinical ad (live)", () => {
  const { profile, job, match } = clinicalFixtures;

  it("asks in the role's own words, skips conditions and asks about the licence to practise", async () => {
    const questions = await askGapQuestions({ profile, job, match });

    const asked = new Set(questions.map((item) => item.gapId));
    const specialist = questions.filter((item) => item.gapId in specialistWords);
    const inRoleWords = specialist.filter((item) => hasAny(item.question, specialistWords[item.gapId]));
    console.log(
      [
        `Gap questions: ${questions.length} for ${match.gaps.length} gaps`,
        `In the ad's own words: ${inRoleWords.length} of ${specialist.length} specialist questions`,
        ...questions.map((item) => `- ${item.gapId} (${words(item.question)} words): ${item.question}${(item.options ?? []).map((option) => `\n    · ${option}`).join("")}`),
      ].join("\n"),
    );

    expect(asked.has(licenceGap), "no question about the licence to practise").toBe(true);
    for (const id of conditionGaps) expect(asked.has(id), `a question about a condition of the job: ${id}`).toBe(false);

    for (const item of questions) {
      expect(words(item.question), item.question).toBeLessThanOrEqual(20);
      const list = specialistWords[item.gapId];
      if (!list) continue;
      expect(hasAny(item.question, list), `not in the ad's words: ${item.question}`).toBe(true);
      for (const option of item.options ?? []) {
        expect(hasAny(option, list), `option does not name the requirement: ${option}`).toBe(true);
        expect(option, "the app adds the No option itself").not.toMatch(/^no\b/i);
      }
    }
  });

  it("reads the criteria of the person specification from the ad", async () => {
    const read = await parseJob(job.description, { url: job.url });
    const kept = read.requirements.essential.length + read.requirements.desirable.length;
    const inAd = job.requirements.essential.length + job.requirements.desirable.length;
    console.log(`Job reader kept ${kept} of ${inAd} criteria (${read.requirements.essential.length} essential, ${read.requirements.desirable.length} desirable)`);

    expect(kept).toBeGreaterThan(0);
    if (JOB_READER_KEEPS_WHOLE_PERSON_SPEC) expect(kept).toBeGreaterThanOrEqual(12);
  });
});
