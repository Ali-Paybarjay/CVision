"use server";

import { after } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/features/account/current-user";
import { getAiMode } from "@/shared/ai";
import { track, type EventActor } from "@/shared/analytics/track";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { checkAdText, parseAdUrl } from "./job-extraction";
import { modelAccessFor } from "./server/access";
import { matchJob, parseJob, sampleJobFor } from "./server/check-job";
import { describeAiError, type AiErrorCode } from "./server/extract-request";
import { saveJobAndMatch } from "./server/job-store";
import { loadAccountProfile } from "./server/profile-account";
import { readProfileInput } from "./server/profile-input";

/**
 * Whether the job and its match were kept: in the user's account, or not because they are signed out,
 * because accounts are not switched on, or because saving failed.
 */
export type SaveState = "saved" | "signed-out" | "unavailable" | "failed";

export type CheckJobResult =
  | {
      ok: true;
      job: Job;
      match: MatchResult;
      saved: SaveState;
      /**
       * Set in mock mode, where no model reads the ad: the job is a sample one and the match comes from simple rules.
       * `sampleProfile` names the sample person whose profile was used when the user had none.
       */
      demo: { sampleProfile: string | null } | null;
    }
  | { ok: false; code: "sign-in" | "ad" | "url" | "profile" | AiErrorCode; message: string };

/**
 * Reads a pasted job ad into a Job, matches it to the user's profile and saves both for a signed-in user.
 * A signed-in user's profile is read from their account, whatever the browser sends. The browser's profile is
 * used only when accounts are not switched on, and a sample profile only in the demo.
 */
export async function checkJobAction(input: { ad: unknown; url: unknown; profile: unknown }): Promise<CheckJobResult> {
  const mode = getAiMode();
  const user = await getCurrentUser();
  const access = modelAccessFor(user, mode);
  if (!access.allowed) {
    return { ok: false, code: "sign-in", message: "Sign in to check a job against your profile." };
  }

  const ad = checkAdText(input?.ad);
  if (!ad.ok) return { ok: false, code: "ad", message: ad.message };
  const url = parseAdUrl(input?.url);
  if (!url.ok) return { ok: false, code: "url", message: url.message };

  let profile: Profile | null = null;
  const supabase = user ? await createSupabaseServerClient() : null;
  if (user && supabase) {
    profile = (await loadAccountProfile(supabase))?.profile ?? null;
  } else if (input.profile != null) {
    const parsed = readProfileInput(input.profile);
    if (!parsed.ok) {
      return { ok: false, code: "profile", message: "Your profile could not be read. Reload the page and try again." };
    }
    profile = parsed.profile;
  }
  if (!profile && mode === "live") {
    return {
      ok: false,
      code: "profile",
      message: "Upload your CV or fill in your details first, so there is a profile to compare with this job.",
    };
  }

  const actor: EventActor | undefined = user ? { userId: user.id } : undefined;
  after(() => track("jobs.ad_pasted", { hasLink: url.url !== null, demo: mode === "mock" }, actor));

  let job: Job;
  try {
    job = await parseJob(ad.text, { url: url.url, requester: access.requester });
  } catch (error) {
    return { ok: false, ...describeAiError(error, "We couldn’t read this job ad.") };
  }

  // In the demo, a visitor without a profile is matched as the sample person the ad belongs to.
  const matchedProfile = profile ?? personas[sampleJobFor(ad.text).persona].profile;
  let match: MatchResult;
  try {
    ({ match } = await matchJob(matchedProfile, job, { requester: access.requester }));
  } catch (error) {
    return { ok: false, ...describeAiError(error, "We couldn’t compare this job with your profile.") };
  }

  const saved = await save(user, job, match);
  after(() =>
    track(
      "jobs.match_shown",
      {
        score: match.score,
        strengths: match.strengths.length,
        gaps: match.gaps.length,
        essentialGaps: match.gaps.filter((gap) => gap.importance === "essential").length,
        saved,
        demo: mode === "mock",
      },
      actor,
    ),
  );

  // A job that isn't kept (a signed-out demo visitor, or no accounts) can only be tailored from the sample data,
  // so in the demo the report points at the sample job this ad was read as, not at an id nothing knows.
  const noAccount = saved === "signed-out" || saved === "unavailable";
  const id = mode === "mock" && noAccount ? sampleJobFor(ad.text).job.id : job.id;

  return {
    ok: true,
    job: { ...job, id },
    match: { ...match, jobId: id },
    saved,
    demo: mode === "mock" ? { sampleProfile: profile ? null : matchedProfile.fullName } : null,
  };
}

async function save(user: CurrentUser | null, job: Job, match: MatchResult): Promise<SaveState> {
  if (!isSupabaseConfigured()) return "unavailable";
  if (!user) return "signed-out";
  const supabase = await createSupabaseServerClient();
  if (!supabase) return "unavailable";
  return (await saveJobAndMatch(supabase, job, match)) ? "saved" : "failed";
}
