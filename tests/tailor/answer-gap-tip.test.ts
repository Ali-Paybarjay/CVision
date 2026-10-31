import { describe, expect, it, vi } from "vitest";
import { answerGap } from "@/features/tailor/actions";
import { personas } from "@/shared/sample-data";

// Reza's sample job: an unclear gap (Excel) and a gap that names two tools (Asana or Jira), with no earlier answers.
const reza = personas.reza;
vi.mock("@/features/tailor/server/my-data", () => ({
  getMyProfile: async () => reza.profile,
  getMyJob: async () => reza.jobs[0],
  getMyMatch: async () => reza.match,
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));

describe("answerGap never asks for more (#191)", () => {
  it.each([
    ["an unclear gap the CV already mentions", "reza-gap-1", /already mentions this/],
    ["a gap that names two tools", "reza-gap-2", /which one/],
  ])("a plain yes to %s gives one optional tip, no change and no error", async (_, gapId, tip) => {
    const result = await answerGap({ jobId: reza.jobs[0].id, gapId, answer: "", hasExperience: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.nextSteps).toEqual([]);
    expect(result.hint).toMatch(tip);
    expect(result.hint).toMatch(/optional/);
  });
});
