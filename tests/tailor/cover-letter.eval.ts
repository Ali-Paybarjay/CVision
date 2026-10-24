// Live prompt evals for the cover letter: real requests to the model, run with `npm run eval`.
import { describe, expect, it } from "vitest";
import { coverLetterText, findBrandProblems, inventedTerms, writeCoverLetter } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import { coverLetterCases, ownPhrasesUsed, templatePhrases } from "./cover-letter.cases";

describe.skipIf(!getAiProvider())("Cover letter (live)", () => {
  describe.each(coverLetterCases)("$name", ({ input, gaps }) => {
    let text = "";

    it("Nothing invented: mentions nothing the user said they have not done", async () => {
      text = coverLetterText(await writeCoverLetter(input), input.profile.fullName);
      expect(inventedTerms(text, gaps, input.answers, input.profile)).toEqual([]);
    });

    it("Sounds like you: reuses the user's own phrases and no template phrases", () => {
      expect(ownPhrasesUsed(text, input)).toBeGreaterThanOrEqual(2);
      for (const phrase of templatePhrases) expect(text.toLowerCase(), phrase).not.toContain(phrase);
    });

    it("follows the brand: no banned words, UK spelling", () => {
      expect(findBrandProblems(text)).toEqual([]);
    });
  });
});
