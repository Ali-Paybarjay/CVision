"use server";

import { getAiMode } from "@/shared/ai";
import { ProfileSchema } from "@/shared/contracts";
import type { FollowUpQuestion } from "./follow-up";
import { describeAiError } from "./server/extract-request";
import { generateFollowUpQuestions } from "./server/generate-follow-up";

export type FollowUpQuestionsResult =
  | { ok: true; questions: FollowUpQuestion[]; demo: boolean }
  | { ok: false; message: string };

/** Writes three to five follow-up questions for the user's approved profile. */
export async function suggestFollowUpQuestionsAction(profile: unknown): Promise<FollowUpQuestionsResult> {
  // Anything can be posted to an action, so the profile is checked before use.
  const parsed = ProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return { ok: false, message: "Your profile could not be read. Reload the page and try again." };
  }

  try {
    const questions = await generateFollowUpQuestions(parsed.data);
    return { ok: true, questions, demo: getAiMode() === "mock" };
  } catch (error) {
    return { ok: false, message: describeAiError(error, "We couldn’t write questions for your profile.").message };
  }
}
