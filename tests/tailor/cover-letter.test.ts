import { describe, expect, it, vi } from "vitest";
import { coverLetterText, declinedRequirements, findBrandProblems, inventedTerms, sampleCoverLetter, writeCoverLetter } from "@/features/tailor";
import { createCoverLetter } from "@/features/tailor/actions";
import { personas } from "@/shared/sample-data";
import { coverLetterCases, ownPhrasesUsed, templatePhrases } from "./cover-letter.cases";

vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

describe("the mock cover letter", () => {
  it.each(coverLetterCases)("for $name is honest, in our voice and in their words", async ({ input, gaps }) => {
    const letter = await writeCoverLetter(input);
    const text = coverLetterText(letter, input.profile.fullName);

    expect(inventedTerms(text, gaps, input.answers, input.profile)).toEqual([]);
    expect(findBrandProblems(text)).toEqual([]);
    for (const phrase of templatePhrases) expect(text.toLowerCase()).not.toContain(phrase);
    expect(ownPhrasesUsed(text, input)).toBeGreaterThanOrEqual(2);
    expect(text).toContain(input.job.company);
    expect(text.endsWith(input.profile.fullName)).toBe(true);
  });

  it("never uses a change the user did not approve", () => {
    const { input } = coverLetterCases[0];
    const unapproved = input.changes.map((change) => ({ ...change, status: "rejected" as const }));
    const text = coverLetterText(sampleCoverLetter({ ...input, changes: unapproved }), input.profile.fullName);
    for (const change of unapproved) expect(text).not.toContain(change.after);
  });
});

describe("the letter's ending (the name appeared twice)", () => {
  const letter = { greeting: "Dear Hiring Manager,", paragraphs: ["I am applying.", "Yours faithfully,", "Sara Ahmadi"], signOff: "Yours faithfully,\nSara Ahmadi" };

  it("has one closing line and one name, whatever the model wrote", () => {
    expect(coverLetterText(letter, "Sara Ahmadi")).toBe("Dear Hiring Manager,\n\nI am applying.\n\nYours sincerely,\n\nSara Ahmadi");
  });

  it("keeps a paragraph that only starts like a closing word", () => {
    const text = coverLetterText({ ...letter, paragraphs: ["Regardless of sector, I plan my work carefully."] }, "Sara Ahmadi");
    expect(text).toContain("Regardless of sector");
  });
});

describe("inventedTerms", () => {
  it("finds a skill the user said they have not used", () => {
    const { input, gaps } = coverLetterCases[0];
    expect(inventedTerms("I have built reports in Power BI.", gaps, input.answers, input.profile)).toEqual(["power bi"]);
  });

  it("still accepts a skill that is on the CV or in a follow-up answer", () => {
    const { input, gaps } = coverLetterCases[0];
    const letter = "I have built reports in Power BI.";
    const onCv = { ...input.profile, skills: [...input.profile.skills, "Power BI"] };
    const answered = {
      ...input.profile,
      followUpAnswers: [
        { id: "fu-1", question: "Which tools?", answer: "Weekly reports in Power BI", answeredAt: "2026-10-01T09:00:00.000Z" },
      ],
    };

    expect(inventedTerms(letter, gaps, input.answers, onCv)).toEqual([]);
    expect(inventedTerms(letter, gaps, input.answers, answered)).toEqual([]);
  });

  it("does not count what the user wants as evidence of what they have done (#164)", () => {
    const { input, gaps } = coverLetterCases[0];
    // Written as a type assertion until `notes` reaches the contract in #199; any other field outside the CV lines works the same.
    const preferences = { ...input.profile.preferences, notes: "Learn Power BI" } as typeof input.profile.preferences;
    const profile = { ...input.profile, preferences };

    expect(inventedTerms("I have built reports in Power BI.", gaps, input.answers, profile)).toEqual(["power bi"]);
  });
});

describe("inventedTerms after a no to a requirement (#251)", () => {
  const { profile, match } = personas.daniel;
  const gaps = [
    { ...match.gaps[0], id: "kpi", requirement: "KPI reporting to senior leadership" },
    { ...match.gaps[0], id: "licence", requirement: "Full clean driving licence" },
  ];
  const answers = gaps.map((gap) => ({ gapId: gap.id, question: "", answer: "I haven't done this.", hasExperience: false }));

  it.each([
    "Your ad asks for KPI reporting to senior leadership across six garden centres.",
    "The role needs a full clean driving licence and regular travel between stores.",
    "I do not yet have KPI reporting to senior leadership on my record.",
  ])("finds the requirement's own words in: %s", (letter) => {
    expect(inventedTerms(letter, gaps, answers, profile)).not.toEqual([]);
  });

  // The word check cannot see the same claim in other words. The prompt rule and the live eval cover these.
  it.each(["I have reported KPIs to senior leaders every week for five years.", "I hold a full UK driving licence with no points."])(
    "does not find a claim in other words: %s",
    (letter) => {
      expect(inventedTerms(letter, gaps, answers, profile)).toEqual([]);
    },
  );

  it("lists what the letter must leave out, but not what the CV shows", () => {
    expect(declinedRequirements(gaps, answers, profile)).toEqual(gaps.map((gap) => gap.requirement));
    const onCv = { ...profile, skills: [...profile.skills, "Full clean driving licence"] };
    expect(declinedRequirements(gaps, answers, onCv)).toEqual(["KPI reporting to senior leadership"]);
  });
});

describe("createCoverLetter", () => {
  it("returns the letter text for the user to edit, with no brand problems", async () => {
    const { input } = coverLetterCases[0];
    const result = await createCoverLetter({ jobId: input.job.id, changes: input.changes, answers: input.answers });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("Dear Hiring Manager,");
    expect(result.problems).toEqual([]);
  });

  it("refuses a request it cannot read", async () => {
    // With sample data an unknown job id falls back to Sara's first job, as in Shayan's my-data (#48).
    expect((await createCoverLetter({ jobId: "", changes: [], answers: [] })).ok).toBe(false);
  });

  it("in live mode, asks a visitor to sign in before calling the model", async () => {
    vi.stubEnv("AI_MODE", "live");
    try {
      expect(await createCoverLetter({ jobId: "sara-job-1", changes: [], answers: [] })).toEqual({
        ok: false,
        message: "Sign in to write your cover letter.",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
