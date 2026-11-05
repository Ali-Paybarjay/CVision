// At the daily limit, a "no" is still kept: it never changes the CV, so it needs no model (#314).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap } from "@/features/tailor/actions";
import { AskModelError } from "@/shared/ai";

const { proposeChanges } = vi.hoisted(() => ({ proposeChanges: vi.fn() }));
vi.mock("@/features/tailor/propose-changes", async (original) => ({ ...(await original<object>()), proposeChanges }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const limit = new AskModelError("You have reached today's limit for AI requests.", "limit-reached");

beforeEach(() => {
  vi.unstubAllEnvs();
  proposeChanges.mockReset();
  proposeChanges.mockRejectedValue(limit);
});

describe("answering a gap question at the daily limit (#314)", () => {
  it("keeps a no from the No button, with a plain next step and nothing on the CV", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "", hasExperience: false });
    expect(result).toMatchObject({ ok: true, hasExperience: false, changes: [], hint: null });
    if (!result.ok) return;
    expect(result.answer).toBe("I haven't done this.");
    expect(result.nextSteps).toEqual([expect.objectContaining({ gapId: "sara-gap-3", kind: "learn" })]);
  });

  it("keeps a no in the user's own words", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "", hasExperience: true, chosen: "No, not yet.", typed: true });
    expect(result).toMatchObject({ ok: true, hasExperience: false, answer: "No, not yet.", changes: [] });
  });

  it("still gives the limit's message for a yes, which needs the model to write a line", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "I used Git at work.", hasExperience: true });
    expect(result).toEqual({ ok: false, message: limit.message });
  });
});

describe("answering after the session has ended", () => {
  it("asks the user to sign in again, rather than saying the job is missing", async () => {
    vi.stubEnv("AI_MODE", "live");
    const result = await answerGap({ jobId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", gapId: "gap-1", answer: "", hasExperience: false });
    expect(result).toEqual({ ok: false, message: "Sign in to get suggestions for your CV." });
  });
});
