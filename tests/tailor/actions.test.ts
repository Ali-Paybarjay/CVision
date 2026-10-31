import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap, decideChange, suggestCvChanges } from "@/features/tailor/actions";
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

  it("drops a suggestion whose evidence the user did not say, and keeps only what they did say", async () => {
    // The sample suggestion quotes "I used Git and GitHub…", which this answer does not say.
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "I know some version control.", hasExperience: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removed).toBe(1);
    expect(result.changes.map((change) => [change.section, change.after, change.evidence])).toEqual([
      ["skills", "Git", "Yes, I have done this at work: Git. I know some version control."],
    ]);
  });

  it.each(["3+ years of Python experience", "Experience managing a team", "First-class degree in Statistics", "Strong SQL"])(
    "does not put %s on the CV from a plain tap: the tap does not confirm all of it",
    async (requirement) => {
      const { personas } = await import("@/shared/sample-data");
      const original = personas.sara.match.gaps[1].requirement;
      personas.sara.match.gaps[1].requirement = requirement;
      const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, where: "study" });
      personas.sara.match.gaps[1].requirement = original;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.changes.filter((change) => change.after === requirement)).toEqual([]);
    },
  );

  it("takes the option the user tapped as their answer, and any detail after it", async () => {
    const chosen = "I built Power BI dashboards at work";
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "For the sales team.", hasExperience: true, chosen });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer).toBe(`${chosen}. For the sales team.`);
  });

  it("needs only a tap: a plain yes to one tool adds it as a skill, quoting the user's answer (#191)", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, where: "study" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer).toBe("Yes, I have done this in study or on my own: Power BI.");
    expect(result.changes).toMatchObject([{ section: "skills", before: null, after: "Power BI", status: "proposed" }]);
    expect(result.nextSteps).toEqual([]);
    expect(result.hint).toBeNull();
  });

  it("a no never adds anything, whatever detail comes with it", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "Power BI", hasExperience: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.hint).toBeNull();
  });

  it("refuses a gap that is not in the job's match", async () => {
    // With sample data an unknown job id falls back to Sara's first job, as in Shayan's my-data (#48).
    expect((await answerGap({ jobId: "unknown-job", gapId: "reza-gap-1", answer: "Yes", hasExperience: true })).ok).toBe(false);
    expect((await answerGap({ jobId: "sara-job-1", gapId: "made-up", answer: "Yes", hasExperience: true })).ok).toBe(false);
  });

  it("in live mode, asks a visitor to sign in before calling the model", async () => {
    vi.stubEnv("AI_MODE", "live");
    try {
      const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-1", answer: "I ran a weekly call.", hasExperience: true });
      expect(result).toEqual({ ok: false, message: "Sign in to get suggestions for your CV." });
    } finally {
      vi.unstubAllEnvs();
    }
  });

});

describe("suggestCvChanges", () => {
  it("suggests changes from the CV alone, each quoting a CV line and waiting for approval (#191)", async () => {
    const result = await suggestCvChanges("sara-job-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.length).toBeGreaterThan(0);
    for (const change of result.changes) {
      expect(change).toMatchObject({ evidenceSource: "cv", status: "proposed", jobId: "sara-job-1" });
      expect(change.gapId).toBeUndefined();
    }
  });

  it("in live mode, asks a visitor to sign in before calling the model", async () => {
    vi.stubEnv("AI_MODE", "live");
    try {
      expect(await suggestCvChanges("sara-job-1")).toEqual({ ok: false, message: "Sign in to get suggestions for your CV." });
    } finally {
      vi.unstubAllEnvs();
    }
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
