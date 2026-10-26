import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskModelError } from "@/shared/ai";
import type { Job } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { suggestLinkedInAction } from "./linkedin-actions";
import { getMyJob, getMyMatch, getMyProfile } from "./my-data";
import { suggestLinkedInExperience } from "./server/linkedin-experience";

const { getCurrentUser, track, createSupabaseServerClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  track: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => void callback() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("./my-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./my-data")>();
  return {
    ...actual,
    getMyJob: vi.fn(actual.getMyJob),
    getMyProfile: vi.fn(actual.getMyProfile),
    getMyMatch: vi.fn(actual.getMyMatch),
  };
});
vi.mock("./server/linkedin-experience", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./server/linkedin-experience")>();
  return { ...actual, suggestLinkedInExperience: vi.fn(actual.suggestLinkedInExperience) };
});

const { sara, reza } = personas;
const user = { id: "user-1", email: null };
/** A job saved in an account has a uuid. */
const savedJob: Job = { ...sara.jobs[0], id: "6f1c2a4e-8b7d-4c3e-9a2b-1d0e5f6a7b8c" };

beforeEach(() => {
  // No accounts: the sample data answers, as in the demo.
  getCurrentUser.mockResolvedValue(null);
  createSupabaseServerClient.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("suggestLinkedInAction", () => {
  it("writes the lines for a sample job in the demo, from that sample person's CV", async () => {
    const result = await suggestLinkedInAction({ jobId: "reza-job-1" });

    expect(result).toMatchObject({ ok: true, demo: true });
    if (!result.ok) return;
    expect(result.suggestions.roles[0].title).toBe("Maths Teacher and Head of Year 9");
    expect(suggestLinkedInExperience).toHaveBeenCalledWith(reza.profile, reza.jobs[0], reza.match, { requester: undefined });
  });

  it("uses the signed-in user's own job, profile and match, on their own daily limit", async () => {
    getCurrentUser.mockResolvedValue(user);
    vi.mocked(getMyJob).mockResolvedValueOnce(savedJob);
    vi.mocked(getMyProfile).mockResolvedValueOnce(sara.profile);
    vi.mocked(getMyMatch).mockResolvedValueOnce({ ...sara.match, jobId: savedJob.id });

    const result = await suggestLinkedInAction({ jobId: savedJob.id });

    expect(result.ok).toBe(true);
    expect(getMyJob).toHaveBeenCalledWith(savedJob.id);
    expect(getMyProfile).toHaveBeenCalledWith({ jobId: savedJob.id });
    expect(suggestLinkedInExperience).toHaveBeenCalledWith(sara.profile, savedJob, { ...sara.match, jobId: savedJob.id }, {
      requester: { userId: "user-1" },
    });
  });

  it("asks a signed-out visitor to sign in when the AI is live, before reading anything", async () => {
    vi.stubEnv("AI_MODE", "live");

    const result = await suggestLinkedInAction({ jobId: "reza-job-1" });

    expect(result).toEqual({ ok: false, code: "sign-in", message: "Sign in to get LinkedIn lines for this job." });
    expect(getMyJob).not.toHaveBeenCalled();
    expect(suggestLinkedInExperience).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it.each([
    ["an id the sample data doesn't have", "someone-elses-job"],
    ["no id", ""],
    ["something that is not an id", 42],
    ["an id far too long", "x".repeat(101)],
  ])("refuses %s, rather than showing another job", async (_, jobId) => {
    const result = await suggestLinkedInAction({ jobId });

    expect(result).toMatchObject({ ok: false, code: "job" });
    expect(suggestLinkedInExperience).not.toHaveBeenCalled();
  });

  it("asks for a CV first when there is no profile yet", async () => {
    getCurrentUser.mockResolvedValue(user);
    vi.mocked(getMyJob).mockResolvedValueOnce(savedJob);
    vi.mocked(getMyProfile).mockResolvedValueOnce(null);

    expect(await suggestLinkedInAction({ jobId: savedJob.id })).toMatchObject({ ok: false, code: "profile" });
    expect(suggestLinkedInExperience).not.toHaveBeenCalled();
  });

  it("explains a failed model request in words the user can act on, and passes on the daily limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(suggestLinkedInExperience).mockRejectedValueOnce(new AskModelError("bad answer", "invalid-answer"));
    vi.mocked(suggestLinkedInExperience).mockRejectedValueOnce(
      new AskModelError("You have reached today's limit. Try again tomorrow.", "limit-reached"),
    );

    expect(await suggestLinkedInAction({ jobId: "reza-job-1" })).toEqual({
      ok: false,
      code: "ai-failed",
      message: "We couldn’t write your LinkedIn lines. Try again in a moment.",
    });
    expect(await suggestLinkedInAction({ jobId: "reza-job-1" })).toEqual({
      ok: false,
      code: "limit-reached",
      message: "You have reached today's limit. Try again tomorrow.",
    });
    expect(track).not.toHaveBeenCalled();
  });

  it("records counts only: never the CV, the ad or the lines", async () => {
    getCurrentUser.mockResolvedValue(user);
    vi.mocked(getMyJob).mockResolvedValueOnce(savedJob);
    vi.mocked(getMyProfile).mockResolvedValueOnce(sara.profile);
    vi.mocked(getMyMatch).mockResolvedValueOnce(sara.match);

    const result = await suggestLinkedInAction({ jobId: savedJob.id });

    expect(result.ok).toBe(true);
    expect(track).toHaveBeenCalledWith(
      "jobs.linkedin_suggested",
      { roles: 1, lines: 2, skills: 4, dropped: 0, demo: true },
      { userId: "user-1" },
    );
    const sent = JSON.stringify(track.mock.calls);
    for (const text of [sara.profile.fullName, "Tableau", "Northgate", savedJob.title, savedJob.company]) {
      expect(sent).not.toContain(text);
    }
  });
});
