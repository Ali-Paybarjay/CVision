import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskModelError } from "@/shared/ai";
import { personas } from "@/shared/sample-data";
import { MAX_PROFILE_CHARACTERS } from "./cv-limits";
import { checkJobAction } from "./job-actions";
import { matchJob, parseJob } from "./server/check-job";
import { saveJobAndMatch } from "./server/job-store";
import { loadAccountProfile } from "./server/profile-account";

const { getCurrentUser, track, isSupabaseConfigured, createSupabaseServerClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  track: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => void callback() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("@/shared/supabase/env", () => ({ isSupabaseConfigured }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("./server/job-store", () => ({ saveJobAndMatch: vi.fn() }));
vi.mock("./server/profile-account", () => ({ loadAccountProfile: vi.fn() }));
vi.mock("./server/check-job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./server/check-job")>();
  return { ...actual, parseJob: vi.fn(actual.parseJob), matchJob: vi.fn(actual.matchJob) };
});

const sara = personas.sara;
const ad = sara.jobs[0].description;
const user = { id: "user-1", email: null };

beforeEach(() => {
  getCurrentUser.mockResolvedValue(user);
  isSupabaseConfigured.mockReturnValue(true);
  createSupabaseServerClient.mockResolvedValue({});
  vi.mocked(saveJobAndMatch).mockResolvedValue(true);
  vi.mocked(loadAccountProfile).mockResolvedValue({ profile: sara.profile, savedAt: "2026-10-21T09:00:00.000Z", cvFormat: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("checkJobAction", () => {
  it("reads the ad, matches it to the user's profile and saves both to their account", async () => {
    const result = await checkJobAction({ ad, url: "https://example.com/job", profile: sara.profile });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job).toMatchObject({ title: "Junior Data Analyst", description: ad, url: "https://example.com/job" });
    expect(result.match.jobId).toBe(result.job.id);
    expect(result.saved).toBe("saved");
    expect(result.demo).toEqual({ sampleProfile: null });
    expect(parseJob).toHaveBeenCalledWith(ad, { url: "https://example.com/job", requester: { userId: "user-1" } });
    expect(matchJob).toHaveBeenCalledWith(sara.profile, result.job, { requester: { userId: "user-1" } });
    expect(saveJobAndMatch).toHaveBeenCalledWith({}, result.job, result.match);
  });

  it("matches a signed-in user's saved profile, whatever the browser sends", async () => {
    const result = await checkJobAction({ ad, url: "", profile: personas.daniel.profile });

    expect(result.ok).toBe(true);
    expect(vi.mocked(matchJob).mock.calls[0][0]).toBe(sara.profile);
  });

  it("asks a signed-in user with no saved profile to upload their CV first when the AI is live", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.mocked(loadAccountProfile).mockResolvedValue(null);

    const result = await checkJobAction({ ad, url: "", profile: sara.profile });

    expect(result).toMatchObject({ ok: false, code: "profile" });
    expect(parseJob).not.toHaveBeenCalled();
  });

  it("uses the browser's profile when accounts are not switched on", async () => {
    getCurrentUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue(null);
    isSupabaseConfigured.mockReturnValue(false);

    const result = await checkJobAction({ ad, url: "", profile: personas.reza.profile });

    expect(result.ok && result.saved).toBe("unavailable");
    expect(vi.mocked(matchJob).mock.calls[0][0]).toEqual(personas.reza.profile);
  });

  it("records both events without the ad or the profile", async () => {
    const result = await checkJobAction({ ad, url: "", profile: sara.profile });

    expect(track).toHaveBeenCalledWith("jobs.ad_pasted", { hasLink: false, demo: true }, { userId: "user-1" });
    expect(track).toHaveBeenCalledWith(
      "jobs.match_shown",
      expect.objectContaining({ score: result.ok ? result.match.score : -1, saved: "saved" }),
      { userId: "user-1" },
    );
    const sent = JSON.stringify(track.mock.calls);
    for (const text of [ad.slice(0, 40), sara.profile.fullName, sara.profile.skills[0], "Pennine"]) {
      expect(sent).not.toContain(text);
    }
  });

  it("asks a signed-out visitor to sign in when the AI is live, before reading anything", async () => {
    vi.stubEnv("AI_MODE", "live");
    getCurrentUser.mockResolvedValue(null);

    const result = await checkJobAction({ ad, url: "", profile: sara.profile });

    expect(result).toEqual({ ok: false, code: "sign-in", message: "Sign in to check a job against your profile." });
    expect(parseJob).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("keeps the demo open to signed-out visitors, without saving", async () => {
    getCurrentUser.mockResolvedValue(null);

    const result = await checkJobAction({ ad, url: "", profile: sara.profile });

    expect(result.ok && result.saved).toBe("signed-out");
    expect(saveJobAndMatch).not.toHaveBeenCalled();
  });

  it("matches the sample person the ad belongs to when a demo visitor has no profile", async () => {
    getCurrentUser.mockResolvedValue(null);
    const emmaAd = personas.emma.jobs[0].description;

    const result = await checkJobAction({ ad: emmaAd, url: "", profile: null });

    expect(result.ok && result.demo).toEqual({ sampleProfile: "Emma Walsh" });
    expect(vi.mocked(matchJob).mock.calls[0][0]).toBe(personas.emma.profile);
  });

  it("refuses a short ad, a bad link or something that is not a profile, before any model request", async () => {
    expect(await checkJobAction({ ad: "Analyst, Leeds", url: "", profile: sara.profile })).toMatchObject({ ok: false, code: "ad" });
    expect(await checkJobAction({ ad, url: "javascript:alert(1)", profile: sara.profile })).toMatchObject({ ok: false, code: "url" });
    getCurrentUser.mockResolvedValue(null);
    expect(await checkJobAction({ ad, url: "", profile: { fullName: "Not a profile" } })).toMatchObject({ ok: false, code: "profile" });
    expect(parseJob).not.toHaveBeenCalled();
  });

  it("says a browser profile is too long to check, rather than to reload the page", async () => {
    getCurrentUser.mockResolvedValue(null);
    const long = { ...sara.profile, summary: "x".repeat(MAX_PROFILE_CHARACTERS) };

    expect(await checkJobAction({ ad, url: "", profile: long })).toMatchObject({
      ok: false,
      code: "profile",
      message: expect.stringContaining("too long to check against a job"),
    });
    expect(parseJob).not.toHaveBeenCalled();
  });

  it("still shows the report when accounts are not switched on, or saving fails", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    expect(await checkJobAction({ ad, url: "", profile: sara.profile })).toMatchObject({ ok: true, saved: "unavailable" });

    isSupabaseConfigured.mockReturnValue(true);
    vi.mocked(saveJobAndMatch).mockResolvedValue(false);
    expect(await checkJobAction({ ad, url: "", profile: sara.profile })).toMatchObject({ ok: true, saved: "failed" });
  });

  it("explains a failed model request in words the user can act on", async () => {
    vi.mocked(parseJob).mockRejectedValueOnce(new AskModelError("bad answer", "invalid-answer"));
    vi.mocked(matchJob).mockRejectedValueOnce(new AskModelError("bad answer", "invalid-answer"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await checkJobAction({ ad, url: "", profile: sara.profile })).toEqual({
      ok: false,
      code: "ai-failed",
      message: "We couldn’t read this job ad. Try again in a moment.",
    });
    expect(await checkJobAction({ ad, url: "", profile: sara.profile })).toEqual({
      ok: false,
      code: "ai-failed",
      message: "We couldn’t compare this job with your profile. Try again in a moment.",
    });
  });

  it("points a demo report that isn't saved at the sample job the ad was read as, so /tailor can open it", async () => {
    const emmaJob = personas.emma.jobs[1];
    getCurrentUser.mockResolvedValue(null);
    expect(await checkJobAction({ ad: emmaJob.description, url: "", profile: null })).toMatchObject({
      ok: true,
      saved: "signed-out",
      job: { id: emmaJob.id },
      match: { jobId: emmaJob.id },
    });

    getCurrentUser.mockResolvedValue(user);
    isSupabaseConfigured.mockReturnValue(false);
    expect(await checkJobAction({ ad: emmaJob.description, url: "", profile: null })).toMatchObject({
      saved: "unavailable",
      job: { id: emmaJob.id },
    });
  });

  it("keeps the saved job's own id, which /tailor reads from the account", async () => {
    const result = await checkJobAction({ ad, url: "", profile: sara.profile });

    expect(result.ok && result.saved).toBe("saved");
    if (!result.ok) return;
    expect(result.job.id).not.toBe(sara.jobs[0].id);
    expect(saveJobAndMatch).toHaveBeenCalledWith({}, result.job, result.match);
  });
});
