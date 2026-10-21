import "server-only";
import { askModel, loadPrompt } from "@/shared/ai";
import type { Profile } from "@/shared/contracts";
import { FollowUpQuestionListSchema, suggestFollowUpQuestions, type FollowUpQuestion } from "../follow-up";
import type { Requester } from "./extract-profile";

/**
 * Writes three to five follow-up questions for a profile with askModel and prompts/profile-follow-up.md.
 * In mock mode the answer is the rule-based questions from suggestFollowUpQuestions().
 */
export async function generateFollowUpQuestions(
  profile: Profile,
  options: { requester?: Requester } = {},
): Promise<FollowUpQuestion[]> {
  const suggested = suggestFollowUpQuestions(profile);

  const { questions } = await askModel({
    feature: "profile-follow-up",
    prompt: await followUpPrompt(profile),
    schema: FollowUpQuestionListSchema,
    sample: { questions: suggested.map(({ question, reason, topic, about }) => ({ question, reason, topic, about })) },
    requester: options.requester,
  });

  return questions.map((question, index) => ({ id: `q${index + 1}`, ...question }));
}

/** The request text for the follow-up questions: the profile without personal details, and the rule-based suggestions. */
export async function followUpPrompt(profile: Profile): Promise<string> {
  const suggested = suggestFollowUpQuestions(profile).map(({ question, topic, about }) => ({ question, topic, about }));
  return loadPrompt("profile-follow-up", {
    profile: JSON.stringify(withoutPersonalDetails(profile), null, 2),
    suggested: JSON.stringify(suggested, null, 2),
  });
}

/** The questions need the experience, not who the person is: name and contact details stay out of the request. */
function withoutPersonalDetails(profile: Profile) {
  const { summary, skills, experience, education, certifications, followUpAnswers } = profile;
  return {
    summary,
    skills,
    experience,
    education,
    certifications,
    followUpAnswers: followUpAnswers.map(({ question, answer }) => ({ question, answer })),
  };
}
