// Live prompt evals for the languages and projects a real CV sends to the model since #253: two real requests, run with `npm run eval`.
import { beforeAll, describe, expect, it } from "vitest";
import { askForProposal, coverLetterText, findBrandProblems, inventedTerms, unsupportedReason, writeCoverLetter } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import { ownPhrasesUsed, templatePhrases } from "../tailor/cover-letter.cases";
import {
  answers,
  claimsHerSpanish,
  claimsLevel,
  gaps,
  input,
  job,
  match,
  namesHerProject,
  numbersNotInSources,
  overstatedLevels,
  wordsNotOnCv,
} from "./languages-projects.cases";

describe.skipIf(!getAiProvider())("Languages and projects (live)", () => {
  describe("cover letter", () => {
    let text = "";

    // In beforeAll, so a failed request fails every check below instead of letting them pass on an empty letter.
    beforeAll(async () => {
      text = coverLetterText(await writeCoverLetter(input), input.profile.fullName);
    }, 120_000);

    it("Nothing invented: adds nothing she said no to or lacks, and no tool, talk or number her CV does not have", () => {
      expect(inventedTerms(text, gaps, answers, input.profile)).toEqual([]);
      expect(wordsNotOnCv(text)).toEqual([]);
      expect(numbersNotInSources(text)).toEqual([]);
    });

    it("Nothing invented: claims no language level her CV does not give", () => {
      expect(overstatedLevels(text)).toEqual([]);
    });

    it("the model reads both sections: it claims her Spanish and names a project that only those sections hold", () => {
      expect(text).toMatch(claimsHerSpanish);
      expect(text).toMatch(namesHerProject);
    });

    it("Sounds like you: reuses her own phrases and no template phrases", () => {
      expect(ownPhrasesUsed(text, input)).toBeGreaterThanOrEqual(2);
      for (const phrase of templatePhrases) expect(text.toLowerCase(), phrase).not.toContain(phrase);
    });

    it("follows the brand: no banned words, UK spelling", () => {
      expect(findBrandProblems(text)).toEqual([]);
    });
  });

  it("CV suggestions: at least one, each with evidence, and none overstating a language or adding what she does not have", async () => {
    const { profile } = input;
    const proposal = await askForProposal({ profile, job, match, answers, sample: { changes: [], nextSteps: [] } });

    expect(proposal.changes.length).toBeGreaterThan(0);
    for (const change of proposal.changes) {
      expect(unsupportedReason(change, { profile, gaps, answers }), change.after).toBeNull();
      expect(wordsNotOnCv(change.after), change.after).toEqual([]);
      expect(numbersNotInSources(change.after), change.after).toEqual([]);
      expect(claimsLevel(change.after), change.after).toBe(false);
    }
  });
});
