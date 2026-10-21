"use server";

import { getCurrentUser } from "@/features/account/current-user";
import { getAiMode } from "@/shared/ai";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { FollowUpQuestion } from "./follow-up";
import { modelAccessFor } from "./server/access";
import { describeAiError } from "./server/extract-request";
import { generateFollowUpQuestions } from "./server/generate-follow-up";
import { deleteAccountProfile } from "./server/profile-account";
import { readProfileInput } from "./server/profile-input";

export type FollowUpQuestionsResult =
  | { ok: true; questions: FollowUpQuestion[]; demo: boolean }
  | { ok: false; message: string };

/** Writes three to five follow-up questions for the user's approved profile. */
export async function suggestFollowUpQuestionsAction(profile: unknown): Promise<FollowUpQuestionsResult> {
  const access = modelAccessFor(await getCurrentUser(), getAiMode());
  if (!access.allowed) {
    return { ok: false, message: "Sign in to get questions about your profile." };
  }

  const input = readProfileInput(profile);
  if (!input.ok) {
    return {
      ok: false,
      message:
        input.reason === "too-long"
          ? "Your profile is too long to write questions for. Shorten the longest sections and try again."
          : "Your profile could not be read. Reload the page and try again.",
    };
  }

  try {
    const questions = await generateFollowUpQuestions(input.profile, { requester: access.requester });
    return { ok: true, questions, demo: getAiMode() === "mock" };
  } catch (error) {
    return { ok: false, message: describeAiError(error, "We couldn’t write questions for your profile.").message };
  }
}

/** Deletes the signed-in user's saved profile and every CV file they uploaded (Your data is yours). */
export async function deleteMyProfileAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getCurrentUser() : null;
  if (!supabase || !user) return { ok: false, message: "Sign in to delete your profile." };

  return (await deleteAccountProfile(supabase, user.id))
    ? { ok: true }
    : { ok: false, message: "We couldn’t delete your profile just now. Try again in a minute." };
}
