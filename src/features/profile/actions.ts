"use server";

import { getCurrentUser } from "@/features/account/current-user";
import { getAiMode } from "@/shared/ai";
import { ProfileSchema } from "@/shared/contracts";
import type { FollowUpQuestion } from "./follow-up";
import { modelAccessFor } from "./server/access";
import { describeAiError } from "./server/extract-request";
import { generateFollowUpQuestions } from "./server/generate-follow-up";

export type FollowUpQuestionsResult =
  | { ok: true; questions: FollowUpQuestion[]; demo: boolean }
  | { ok: false; message: string };

/**
 * Well above any real profile: a CV is cut at 30,000 characters before it becomes one, and answers are short.
 * A bigger one is not from our page, and would cost money and time to read.
 */
const MAX_PROFILE_CHARACTERS = 60_000;

/** Writes three to five follow-up questions for the user's approved profile. */
export async function suggestFollowUpQuestionsAction(profile: unknown): Promise<FollowUpQuestionsResult> {
  const access = modelAccessFor(await getCurrentUser(), getAiMode());
  if (!access.allowed) {
    return { ok: false, message: "Sign in to get questions about your profile." };
  }

  // Anything can be posted to an action, so the profile is checked before use: its size first, then its shape.
  if (!fitsSizeLimit(profile)) {
    return { ok: false, message: "Your profile is too long to write questions for. Shorten the longest sections and try again." };
  }
  const parsed = ProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return { ok: false, message: "Your profile could not be read. Reload the page and try again." };
  }

  try {
    const questions = await generateFollowUpQuestions(parsed.data, { requester: access.requester });
    return { ok: true, questions, demo: getAiMode() === "mock" };
  } catch (error) {
    return { ok: false, message: describeAiError(error, "We couldn’t write questions for your profile.").message };
  }
}

function fitsSizeLimit(value: unknown): boolean {
  try {
    return (JSON.stringify(value) ?? "").length <= MAX_PROFILE_CHARACTERS;
  } catch {
    // Not plain data (a loop, for example), so not a profile either.
    return false;
  }
}
