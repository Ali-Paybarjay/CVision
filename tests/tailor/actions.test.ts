import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap, decideChange } from "@/features/tailor/actions";
import type { TailoringChange } from "@/shared/contracts";

const { getCurrentUser, createSupabaseServerClient, track } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

beforeEach(() => {
  vi.clearAllMocks();
  createSupabaseServerClient.mockResolvedValue(null);
  getCurrentUser.mockResolvedValue(null);
});

describe("answerGap", () => {
  it("suggests a change from a real answer, waiting for the user's approval", async () => {
    const result = await answerGap({
      jobId: "sara-job-1",
      gapId: "sara-gap-1",
      answer:
        "Every Monday I walked the regional managers through the dashboard on a call and wrote a one-page summary in plain English with the three things that changed that week.",
      hasExperience: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ jobId: "sara-job-1", gapId: "sara-gap-1", status: "proposed" });
  });

  it("adds nothing when the user has not done it, and offers a next step", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "", hasExperience: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });

  it("drops a suggestion whose evidence the user did not say", async () => {
    // The sample suggestion quotes "I used Git and GitHub…", which this answer does not say.
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "I know some version control.", hasExperience: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.removed).toBe(1);
  });

  it("asks for an answer before suggesting anything", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-1", answer: "  ", hasExperience: true });
    expect(result.ok).toBe(false);
  });

  it("refuses a job or gap that is not the user's", async () => {
    expect((await answerGap({ jobId: "reza-job-1", gapId: "reza-gap-1", answer: "Yes", hasExperience: true })).ok).toBe(false);
    expect((await answerGap({ jobId: "sara-job-1", gapId: "made-up", answer: "Yes", hasExperience: true })).ok).toBe(false);
  });
});

const jobId = "0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10";
const change: TailoringChange = {
  id: "5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  jobId,
  gapId: "gap-1",
  section: "skills",
  before: null,
  after: "Git and GitHub",
  evidence: "I used Git and GitHub for my MSc dissertation code",
  evidenceSource: "follow-up-answer",
  status: "approved",
};

function fakeSupabase(jobs: string[]) {
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    upsert,
    client: {
      from(table: string) {
        if (table === "tailoring_changes") return { upsert };
        let id: unknown;
        const query = {
          select: () => query,
          eq: (_: string, value: unknown) => ((id = value), query),
          maybeSingle: async () => ({ data: jobs.includes(id as string) ? { id } : null, error: null }),
        };
        return query;
      },
    },
  };
}

describe("decideChange", () => {
  it("saves an approved change in tailoring_changes for the signed-in user", async () => {
    const fake = fakeSupabase([jobId]);
    createSupabaseServerClient.mockResolvedValue(fake.client);
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect(await decideChange(change)).toEqual({ saved: true });
    expect(fake.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: change.id, job_id: jobId, data: change }));
  });

  it("records the decision without any CV text", async () => {
    await decideChange({ ...change, status: "rejected" });
    expect(track).toHaveBeenCalledWith("tailor.change_rejected", { section: "skills", evidenceSource: "follow-up-answer" }, { anonymousKey: "visitor" });
    expect(JSON.stringify(track.mock.calls)).not.toContain("Git and GitHub");
  });

  it("does not save a change for a job in another account", async () => {
    const fake = fakeSupabase([]);
    createSupabaseServerClient.mockResolvedValue(fake.client);
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect(await decideChange(change)).toMatchObject({ saved: false, reason: "job-not-found" });
    expect(fake.upsert).not.toHaveBeenCalled();
  });

  it("explains why a sample job is not saved", async () => {
    createSupabaseServerClient.mockResolvedValue(fakeSupabase([]).client);
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    expect(await decideChange({ ...change, jobId: "sara-job-1" })).toMatchObject({ saved: false, reason: "sample-job" });
  });

  it("refuses a change without evidence", async () => {
    expect(await decideChange({ ...change, evidence: "" })).toMatchObject({ saved: false, reason: "invalid" });
  });
});
