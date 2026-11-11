import { describe, expect, it } from "vitest";
import { coverLetterText } from "@/features/tailor/cover-letter";
import { bodyWordCount, canApprove, currentLetter, joinLetter, letterBasis, splitLetter } from "@/features/tailor/letter-state";
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

describe("the letter's paragraphs", () => {
  const text = coverLetterText(
    { greeting: "Dear Hiring Manager,", paragraphs: ["I am applying for the role.", "I took minutes at the monthly team meeting.", "I would welcome an interview."], signOff: "Yours sincerely," },
    "Sara Ahmadi",
  );

  it("splits a written letter into greeting, body and closing, with every paragraph waiting for a decision", () => {
    const draft = splitLetter(text);
    expect(draft.greeting).toBe("Dear Hiring Manager,");
    expect(draft.paragraphs.map((paragraph) => paragraph.decision)).toEqual(["pending", "pending", "pending"]);
    expect(draft.closing).toBe("Yours sincerely,\n\nSara Ahmadi");
  });

  it("joins back to the same text while nothing is removed", () => {
    expect(joinLetter(splitLetter(text))).toBe(text);
  });

  it("leaves a removed paragraph out of the letter and its word count", () => {
    const draft = splitLetter(text, "kept");
    draft.paragraphs[1].decision = "removed";
    expect(joinLetter(draft)).not.toContain("minutes");
    expect(joinLetter(draft)).toContain("Yours sincerely,");
    expect(bodyWordCount(draft)).toBe(11);
  });

  it("can be approved only when every paragraph has a decision and one is kept", () => {
    const draft = splitLetter(text);
    expect(canApprove(draft)).toBe(false);
    draft.paragraphs.forEach((paragraph) => (paragraph.decision = "removed"));
    expect(canApprove(draft)).toBe(false);
    draft.paragraphs[0].decision = "kept";
    expect(canApprove(draft)).toBe(true);
  });

  it("takes any closing line, not only “Yours sincerely”, as the end of the letter", () => {
    expect(splitLetter("Dear Hiring Manager,\n\nI plan my work.\n\nKind regards,\n\nSara Ahmadi").closing).toBe("Kind regards,\n\nSara Ahmadi");
  });
});
