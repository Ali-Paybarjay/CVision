import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt } from "@/shared/ai";
import { GapQuestionListSchema, type GapQuestion } from "./types";

/** A plain question for one gap, used as the mock answer and as a fallback. */
export function defaultGapQuestion(gap: Gap): GapQuestion {
  const question =
    gap.kind === "missing"
      ? `The job asks for “${gap.requirement}”. Have you done this at work, in study or on your own? If so, tell us what you did, in your own words.`
      : `The job asks for “${gap.requirement}”. ${gap.detail} Tell us about one time you did this: what you did and what changed as a result.`;
  return { gapId: gap.id, question };
}

/** One question about the user's real experience for every gap in the match. */
export async function askGapQuestions(input: { profile: Profile; job: Job; match: MatchResult }): Promise<GapQuestion[]> {
  const { profile, job, match } = input;
  if (match.gaps.length === 0) return [];

  const prompt = await loadPrompt("tailor-gap-questions", {
    job: JSON.stringify({ title: job.title, company: job.company, requirements: job.requirements }, null, 2),
    cv: JSON.stringify({ summary: profile.summary, skills: profile.skills, experience: profile.experience }, null, 2),
    gaps: JSON.stringify(match.gaps, null, 2),
  });

  const { questions } = await askModel({
    feature: "tailor-gap-questions",
    prompt,
    schema: GapQuestionListSchema,
    sample: { questions: match.gaps.map(defaultGapQuestion) },
    effort: "low",
  });

  // Exactly one question per gap, in the match's order, even if the model skips or repeats one.
  return match.gaps.map((gap) => questions.find((item) => item.gapId === gap.id) ?? defaultGapQuestion(gap));
}
