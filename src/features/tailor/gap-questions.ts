import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { GapQuestionListSchema, type GapQuestion } from "./types";

/** A plain yes-or-no question for one gap, used as the mock answer and as a fallback. */
export function defaultGapQuestion(gap: Gap): GapQuestion {
  const question =
    gap.kind === "missing"
      ? `The job asks for “${gap.requirement}”. Have you done this?`
      : `The job asks for “${gap.requirement}”, and your CV does not show it clearly. Have you done this?`;
  return { gapId: gap.id, question };
}

/** One question about the user's real experience for every gap in the match. */
export async function askGapQuestions(input: {
  profile: Profile;
  job: Job;
  match: MatchResult;
  /** Whose daily limit the request counts against: { userId } for a signed-in user. */
  requester?: Requester;
}): Promise<GapQuestion[]> {
  const { profile, job, match, requester } = input;
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
    requester,
  });

  // Exactly one question per gap, in the match's order, even if the model skips or repeats one.
  return match.gaps.map((gap) => questions.find((item) => item.gapId === gap.id) ?? defaultGapQuestion(gap));
}
