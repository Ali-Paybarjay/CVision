"use server";

import { after } from "next/server";
import { getCurrentUser } from "@/features/account/current-user";
import { getAiMode } from "@/shared/ai";
import { track, type EventActor } from "@/shared/analytics/track";
import { nothingToWrite, type LinkedInSuggestions } from "./linkedin";
import { getMyJob, getMyMatch, getMyProfile } from "./my-data";
import { modelAccessFor } from "./server/access";
import { describeAiError, type AiErrorCode } from "./server/extract-request";
import { suggestLinkedInExperience } from "./server/linkedin-experience";

export type LinkedInResult =
  | {
      ok: true;
      suggestions: LinkedInSuggestions;
      /** True in mock mode, where the lines come from simple rules instead of the model. */
      demo: boolean;
    }
  | { ok: false; code: "sign-in" | "job" | "profile" | AiErrorCode; message: string };

/** Longer than any job id: a uuid in an account, "sara-job-1" in the sample data. */
const MAX_JOB_ID_CHARACTERS = 100;

const nothingMessages = {
  "no-roles": "Add your work experience to your profile first, so there are roles to suggest lines for.",
  "no-lines": "Add what you did in each role to your profile first, so there are lines to suggest.",
} as const;

/**
 * Suggests which CV lines to add under each role of the user's LinkedIn Experience for one of their jobs. Only the job's id
 * comes from the browser: the job, its match and the profile are read again on the server, from the account or, in
 * the demo, from the sample data. Nothing is saved.
 */
export async function suggestLinkedInAction(input: { jobId: unknown }): Promise<LinkedInResult> {
  const mode = getAiMode();
  const user = await getCurrentUser();
  const access = modelAccessFor(user, mode);
  if (!access.allowed) {
    return { ok: false, code: "sign-in", message: "Sign in to get LinkedIn lines for this job." };
  }

  const jobId = typeof input?.jobId === "string" ? input.jobId.trim() : "";
  const notFound = { ok: false, code: "job", message: "We couldn’t find this job. Go back and choose one of your jobs." } as const;
  if (!jobId || jobId.length > MAX_JOB_ID_CHARACTERS) return notFound;

  const [job, profile, match] = await Promise.all([getMyJob(jobId), getMyProfile({ jobId }), getMyMatch(jobId)]);
  // The sample data answers any unknown id with Sara's first job: that would be someone else's job.
  if (!job || job.id !== jobId) return notFound;
  if (!profile) {
    return { ok: false, code: "profile", message: "Build your profile first: upload your CV or fill in your details yourself." };
  }
  // Checked before the model is asked: with nothing to take lines from, every request would come back empty.
  const nothing = nothingToWrite(profile);
  if (nothing) return { ok: false, code: "profile", message: nothingMessages[nothing] };

  let suggestions: LinkedInSuggestions;
  try {
    ({ suggestions } = await suggestLinkedInExperience(profile, job, match, { requester: access.requester }));
  } catch (error) {
    return { ok: false, ...describeAiError(error, "Something went wrong on our side.") };
  }

  const actor: EventActor | undefined = user ? { userId: user.id } : undefined;
  after(() =>
    track(
      "jobs.linkedin_suggested",
      {
        roles: suggestions.roles.length,
        lines: suggestions.roles.reduce((sum, role) => sum + role.lines.length, 0),
        skills: suggestions.roles.reduce((sum, role) => sum + role.skills.length, 0),
        dropped: suggestions.dropped,
        demo: mode === "mock",
      },
      actor,
    ),
  );

  return { ok: true, suggestions, demo: mode === "mock" };
}
