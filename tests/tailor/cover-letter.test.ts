import { describe, expect, it, vi } from "vitest";
import { coverLetterText, findBrandProblems, inventedTerms, sampleCoverLetter, writeCoverLetter } from "@/features/tailor";
import { createCoverLetter } from "@/features/tailor/actions";
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

describe("inventedTerms", () => {
  it("finds a skill the user said they have not used", () => {
    const { input, gaps } = coverLetterCases[0];
    expect(inventedTerms("I have built reports in Power BI.", gaps, input.answers, input.profile)).toEqual(["power bi"]);
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
