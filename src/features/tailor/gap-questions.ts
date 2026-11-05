import { createHash } from "node:crypto";
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

type GapQuestionsInput = {
  profile: Profile;
  job: Job;
  match: MatchResult;
  /** Whose daily limit the request counts against: { userId } for a signed-in user. */
  requester?: Requester;
};

/** How long one job's questions are kept, and how many sets at most, so memory stays small. */
const keepFor = 6 * 60 * 60 * 1000;
const maxKept = 500;
const kept = new Map<string, { at: number; questions: Promise<GapQuestion[]> }>();

/**
 * A question about the user's real experience for each gap worth asking about, with answers they can tap.
 * Asked once per user and job (#296): opening the page again, going Back or reloading reuses the same questions
 * for six hours, and two requests at the same moment share one model request. A new Profile, job ad or match
 * asks again. A failure is not kept, so the next visit tries again. The questions live only in this server's
 * memory, never in a file or the database.
 */
export async function askGapQuestions(input: GapQuestionsInput): Promise<GapQuestion[]> {
  if (skillGaps(input.match.gaps).length === 0) return [];

  const key = cacheKey(input);
  const now = Date.now();
  const hit = kept.get(key);
  if (hit && now - hit.at < keepFor) return hit.questions;

  for (const [oldKey, entry] of kept) if (now - entry.at >= keepFor) kept.delete(oldKey);
  while (kept.size >= maxKept) kept.delete(kept.keys().next().value!);

  const questions = writeGapQuestions(input);
  kept.set(key, { at: now, questions });
  questions.catch(() => {
    if (kept.get(key)?.questions === questions) kept.delete(key);
  });
  return questions;
}

/** Whose questions they are, and a hash of everything they are written from: no CV text is kept in the key. */
function cacheKey({ profile, job, match, requester }: GapQuestionsInput): string {
  const who = JSON.stringify(requester ?? null);
  return createHash("sha256").update(JSON.stringify([who, profile, job, match])).digest("hex");
}

/** For tests: forgets every kept set of questions. */
export function forgetGapQuestions(): void {
  kept.clear();
}

async function writeGapQuestions({ profile, job, match, requester }: GapQuestionsInput): Promise<GapQuestion[]> {
  const gaps = skillGaps(match.gaps);

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
