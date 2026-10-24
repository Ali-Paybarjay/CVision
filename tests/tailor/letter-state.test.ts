import { describe, expect, it } from "vitest";
import { currentLetter, letterBasis } from "@/features/tailor/letter-state";
import type { GapAnswer } from "@/features/tailor/types";
import type { TailoringChange } from "@/shared/contracts";

const git: TailoringChange = {
  id: "change-git",
  jobId: "sara-job-1",
  gapId: "sara-gap-3",
  section: "skills",
  before: null,
  after: "Git and GitHub",
  evidence: "I used Git and GitHub for my MSc dissertation code",
  evidenceSource: "follow-up-answer",
  status: "approved",
};
const yes: GapAnswer = { gapId: "sara-gap-3", question: "Have you used Git?", answer: "I used Git and GitHub for my MSc dissertation code.", hasExperience: true };

describe("an approved cover letter", () => {
  const basis = letterBasis([git], [yes]);
  const letter = { text: "Dear Hiring Manager, … I use Git and GitHub …", approved: true, basis };

  it("stays approved while the CV it rests on is the same", () => {
    expect(currentLetter(letter, letterBasis([git], [yes]))).toEqual(letter);
  });

  it("needs a new look once the user rejects a change it used", () => {
    expect(currentLetter(letter, letterBasis([{ ...git, status: "rejected" }], [yes]))).toMatchObject({ approved: false, stale: true });
  });

  it("needs a new look once the user changes an answer to “I haven’t done this”", () => {
    const no = { ...yes, answer: "I haven't done this.", hasExperience: false };
    expect(currentLetter(letter, letterBasis([], [no]))).toMatchObject({ approved: false, stale: true });
  });

  it("does not care about the order of changes and answers", () => {
    const other = { ...git, id: "change-sql", after: "SQL" };
    expect(letterBasis([git, other], [yes])).toBe(letterBasis([other, git], [yes]));
  });
});
