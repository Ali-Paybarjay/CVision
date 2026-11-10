"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/features/account/current-user";
import { getAiMode } from "@/shared/ai";
import { track, type EventActor } from "@/shared/analytics/track";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { checkAdText, MAX_AD_CHARACTERS, parseAdUrl } from "./job-extraction";
import { adLinkFailureMessage, jobSite, linkLimitMessages, siteLabel } from "./job-link";
import { modelAccessFor } from "./server/access";
import { matchJob, parseJob, sampleJobFor } from "./server/check-job";
import { describeAiError, type AiErrorCode } from "./server/extract-request";
import { deleteJob, saveJobAndMatch } from "./server/job-store";
import { reserveLinkRead, settleLinkRead } from "./server/link-read-limit";
import { loadAccountProfile } from "./server/profile-account";
import { readProfileInput } from "./server/profile-input";
import { readAdLink } from "./server/read-ad-link";

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
      const message =
        parsed.reason === "too-long"
          ? "Your profile is too long to check against a job. Shorten the longest sections on your Profile page, then try again."
          : "Your profile could not be read. Reload the page and try again.";
      return { ok: false, code: "profile", message };
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

export type ReadAdLinkResult =
  | {
      ok: true;
      /** The ad's text, for the user to check in the ad box before the match. */
      text: string;
      /** Where it came from, as people write it: "reed.co.uk". */
      site: string;
      /** More text than an ad has: the page around it came too, so the user trims it before the check. */
      tooLong: boolean;
    }
  // "unreadable" also when the day's reads from links are used up: either way the page asks for the ad's text.
  | { ok: false; code: "sign-in" | "url" | "unreadable"; message: string };

/**
 * Opens the link to a job ad on the server and returns the ad's text (#330). Nothing goes to the AI here: the text goes
 * into the ad box, and the user checks it and asks for the match themselves (#278).
 */
export async function readAdLinkAction(input: { url: unknown }): Promise<ReadAdLinkResult> {
  const mode = getAiMode();
  const user = await getCurrentUser();
  // The same rule as the check: in live mode only a signed-in user may have our server open a link.
  const access = modelAccessFor(user, mode);
  if (!access.allowed) {
    return { ok: false, code: "sign-in", message: "Sign in to check a job against your profile." };
  }

  const url = parseAdUrl(input?.url);
  if (!url.ok) return { ok: false, code: "url", message: url.message };
  const link = url.url;
  if (link === null) return { ok: false, code: "url", message: "Paste the link to the ad first." };

  const actor: EventActor | undefined = user ? { userId: user.id } : undefined;
  const demo = mode === "mock";
  // Each page our server opens takes one of the day's reads (#391). A site we never open takes none.
  const reserved = jobSite(link)?.textOnly ? null : await reserveLinkRead(access.requester);
  if (reserved && !reserved.ok) {
    const { reason } = reserved;
    after(() => track("jobs.link_read", { outcome: reason, site: jobSite(link)?.name ?? "other", demo }, actor));
    return { ok: false, code: "unreadable", message: linkLimitMessages[reason] };
  }

  // The link is kept with the job as the user gave it; the page it led to names the site.
  const read = await readAdLink(link);
  // The site's name from our list, never the address: a company's own careers page would name the employer.
  const site = jobSite(read.url)?.name ?? "other";
  if (reserved) after(() => settleLinkRead(reserved.id, read.ok));
  after(() => track("jobs.link_read", { outcome: read.ok ? "read" : read.reason, site, demo }, actor));

  if (!read.ok) return { ok: false, code: "unreadable", message: adLinkFailureMessage(read.reason, read.url) };
  return { ok: true, text: read.text, site: siteLabel(read.url), tooLong: read.truncated || read.text.length > MAX_AD_CHARACTERS };
}

export type DeleteJobResult = { ok: true } | { ok: false; message: string };

const deleteJobMessages = {
  "on-dashboard": "This job is on your dashboard, so it can’t be deleted here.",
  "not-found": "We couldn’t find this job. Reload the page to see your jobs.",
  failed: "We couldn’t delete this job just now. Try again in a minute.",
} as const;

/**
 * Deletes one of the signed-in user's jobs from a list of their jobs (#462), with everything kept for it, unless they
 * applied for it: a job on the dashboard stays. A page left open for another account can't delete anything, as the
 * database deletes only the rows of the account signed in now.
 */
export async function deleteJobAction(jobId: unknown): Promise<DeleteJobResult> {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getCurrentUser() : null;
  if (!supabase || !user) return { ok: false, message: "Sign in to delete a job." };
  // Anything can be posted to an action, so the id is checked before use.
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, message: deleteJobMessages["not-found"] };

  const outcome = await deleteJob(supabase, id.data);
  return outcome === "deleted" ? { ok: true } : { ok: false, message: deleteJobMessages[outcome] };
}

async function save(user: CurrentUser | null, job: Job, match: MatchResult): Promise<SaveState> {
  if (!isSupabaseConfigured()) return "unavailable";
  if (!user) return "signed-out";
  const supabase = await createSupabaseServerClient();
  if (!supabase) return "unavailable";
  return (await saveJobAndMatch(supabase, job, match)) ? "saved" : "failed";
}
