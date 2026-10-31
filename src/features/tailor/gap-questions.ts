import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { GapQuestionListSchema, type GapQuestion } from "./types";

/**
 * Conditions of the job, not skills or experience. No CV line can come from them, so they are never asked about.
 * Only whole phrases: "Experience leading shift teams" or "Processing DBS checks" are real experience to ask about.
 * Anything less clear-cut is left to prompts/tailor-gap-questions.md, because the model sees the whole ad.
 */
const notAboutSkills = new RegExp(
  [
    "driv(ing|er'?s?) licen[cs]e",
    "full (uk )?licen[cs]e",
    "own (car|vehicle|transport)",
    "^right to work$",
    "right to work in\\b",
    "visa sponsorship",
    "willing(ness)? to (travel|relocate)",
    "^(enhanced |basic |standard )?(dbs|bpss)( checks?| clearance)?( required)?$",
    "^(current |active |valid )?security clearance",
    "^available (to work|for)\\b",
    "^(weekend|night|evening)s?\\b.*\\b(work|cover|shifts?)\\b",
    "notice period",
    "^nationality\\b",
    "^based in\\b",
    "able to commute",
  ].join("|"),
  "i",
);

/** The gaps worth a question: what the job asks the person to know or have done. */
export function skillGaps(gaps: Gap[]): Gap[] {
  return gaps.filter((gap) => !notAboutSkills.test(gap.requirement));
}

/** A plain yes-or-no question for one gap, used as the mock answer and as a fallback. */
export function defaultGapQuestion(gap: Gap): GapQuestion {
  const question =
    gap.kind === "missing"
      ? `The job asks for “${gap.requirement}”. Have you done this?`
      : `The job asks for “${gap.requirement}”, and your CV does not show it clearly. Have you done this?`;
  return { gapId: gap.id, question };
}

/** A question about the user's real experience for each gap worth asking about, with answers they can tap. */
export async function askGapQuestions(input: {
  profile: Profile;
  job: Job;
  match: MatchResult;
  /** Whose daily limit the request counts against: { userId } for a signed-in user. */
  requester?: Requester;
}): Promise<GapQuestion[]> {
  const { profile, job, match, requester } = input;
  const gaps = skillGaps(match.gaps);
  if (gaps.length === 0) return [];

  const prompt = await loadPrompt("tailor-gap-questions", {
    job: JSON.stringify({ title: job.title, company: job.company, description: job.description, requirements: job.requirements }, null, 2),
    cv: JSON.stringify({ summary: profile.summary, skills: profile.skills, experience: profile.experience, education: profile.education, certifications: profile.certifications }, null, 2),
    gaps: JSON.stringify(gaps, null, 2),
  });

  const { questions } = await askModel({
    feature: "tailor-gap-questions",
    prompt,
    schema: GapQuestionListSchema,
    sample: { questions: gaps.map(defaultGapQuestion) },
    effort: "low",
    requester,
  });

  // In the match's order, at most one per gap. A gap the model left out is one the CV already covers or that gives no CV line.
  return gaps.flatMap((gap) => questions.find((item) => item.gapId === gap.id) ?? []);
}
