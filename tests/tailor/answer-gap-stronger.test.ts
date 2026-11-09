import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap } from "@/features/tailor/actions";
import { strongerGaps } from "@/features/tailor/gap-questions";
import type * as Propose from "@/features/tailor/propose-changes";
import { personas } from "@/shared/sample-data";

const { propose } = vi.hoisted(() => ({ propose: vi.fn() }));
vi.mock("@/features/tailor/propose-changes", async (importOriginal) => {
  const real = await importOriginal<typeof Propose>();
  return {
    ...real,
    proposeChanges: (input: Propose.ProposeInput) => {
      propose(input);
      return real.proposeChanges(input);
    },
  };
});
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const { jobs, match } = personas.sara;
const sql = strongerGaps(jobs[0], match)[0];

beforeEach(() => vi.clearAllMocks());

describe("answerGap for a Make it stronger question", () => {
  it("finds the strength's gap, and sends a yes on to the suggestion like any unclear gap", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: sql.id, answer: "", hasExperience: true, chosen: "I wrote the SQL for the weekly sales report" });
    expect(result.ok).toBe(true);
    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose.mock.calls[0][0].match.gaps).toEqual([sql]);
  });

  it("takes a no as nothing more to add: no model call, no change, no next step", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: sql.id, answer: "", hasExperience: false });
    expect(result).toEqual({
      ok: true,
      answer: "I haven't done this.",
      hasExperience: false,
      changes: [],
      nextSteps: [],
      hint: "No problem. Your CV keeps this line as it is.",
      removed: 0,
    });
    expect(propose).not.toHaveBeenCalled();
  });

  it("never passes that no on as not done, so it blocks no later change", async () => {
    const result = await answerGap({
      jobId: "sara-job-1",
      gapId: "sara-gap-1",
      answer:
        "Every Monday I walked the regional managers through the dashboard on a call and wrote a one-page summary in plain English with the three things that changed that week.",
      hasExperience: true,
      earlierAnswers: [{ gapId: sql.id, answer: "No", hasExperience: false }],
    });
    expect(result.ok && result.changes).toHaveLength(1);
    const { context } = propose.mock.calls[0][0];
    expect(context.answers.map((item: { gapId: string }) => item.gapId)).not.toContain(sql.id);
  });

  it("still keeps a yes to a strength among the earlier answers", async () => {
    await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-1", answer: "", hasExperience: true, earlierAnswers: [{ gapId: sql.id, answer: "I wrote it", hasExperience: true }] });
    expect(propose.mock.calls[0][0].context.answers).toEqual([expect.objectContaining({ gapId: sql.id, hasExperience: true })]);
  });
});
