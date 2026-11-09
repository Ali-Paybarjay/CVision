import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { jobForPrompt } from "./job-for-prompt";
import { GapQuestionListSchema, type GapQuestion } from "./types";

/**
 * Conditions of the job, not skills or experience. No CV line can come from them, so they are never asked about.
 * Only whole phrases: "Experience leading shift teams" or "Processing DBS checks" are real experience to ask about.
 * Anything less clear-cut is left to prompts/tailor-gap-questions.md, because the model sees the whole ad.
 */
const notAboutSkills = new RegExp(
  [
    // Only a driving licence: "Full licence to practise" or "Gas Safe licence" is a qualification to ask about (#401).
    "driv(ing|er'?s?) licen[cs]e",
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

/** The most questions Tailor fills up to with strengths. It never cuts a gap's question to stay under it. */
export const questionTarget = 5;

/** Lower case, single spaces, no full stop at the end: the same requirement however the ad and the match spell it. */
function normalised(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.;:,\s]+$/, "");
}

/** FNV-1a: a short, stable id for a text, with no node: import, so this file stays safe to import from anywhere. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * "Make it stronger": requirements the CV already meets, as gaps of kind "unclear" whose detail quotes the CV line.
 * A same-field CV meets almost everything, so without these a pilot got only two questions (7 Nov). The model asks
 * about the ones whose line gives no scale, scope, systems or result. A no to one of them never counts as "not done".
 */
export function strongerGaps(job: Job, match: MatchResult): Gap[] {
  const asked = new Set(skillGaps(match.gaps).map((gap) => normalised(gap.requirement)));
  const essential = new Set(job.requirements.essential.map(normalised));
  const seen = new Set<string>();
  return match.strengths.flatMap((strength) => {
    const requirement = normalised(strength.requirement);
    if (notAboutSkills.test(strength.requirement) || asked.has(requirement) || seen.has(requirement)) return [];
    seen.add(requirement);
    return [
      {
        id: `stronger-${shortHash(requirement)}`,
        requirement: strength.requirement,
        importance: essential.has(requirement) ? "essential" : "desirable",
        kind: "unclear",
        detail: `The CV shows it in: "${strength.evidence}"`,
      } satisfies Gap,
    ];
  });
}

/** True for a gap made by strongerGaps: the CV meets it already, so a no means "nothing more to add". */
export function isStrongerGap(gap: Gap): boolean {
  return gap.id.startsWith("stronger-");
}

/** Every gap a question can be about: the match's gaps first, then the strengths to make stronger. */
export function questionGaps(job: Job, match: MatchResult): Gap[] {
  return [...skillGaps(match.gaps), ...strongerGaps(job, match)];
}

const essentialFirst = (gaps: Gap[]) => [...gaps].sort((a, b) => Number(b.importance === "essential") - Number(a.importance === "essential"));

/**
 * The questions to show, from what the model wrote: one per known gap, every gap's question, then strength
 * questions only until there are `questionTarget` in all. Essentials come first in each group.
 */
export function pickQuestions(questions: GapQuestion[], gaps: Gap[], stronger: Gap[]): GapQuestion[] {
  const one = (gap: Gap) => questions.find((item) => item.gapId === gap.id) ?? [];
  const fromGaps = essentialFirst(gaps).flatMap(one);
  const fromStrengths = essentialFirst(stronger).flatMap(one).slice(0, Math.max(0, questionTarget - fromGaps.length));
  return [...fromGaps, ...fromStrengths];
}

/**
 * A question about the user's real experience for each gap worth asking about, with answers they can tap, and
 * questions that make thin CV lines stronger until there are five in all.
 */
export async function askGapQuestions(input: {
  profile: Profile;
  job: Job;
  match: MatchResult;
  /** Whose daily limit the request counts against: { userId } for a signed-in user. */
  requester?: Requester;
}): Promise<GapQuestion[]> {
  const { profile, job, match, requester } = input;
  const gaps = skillGaps(match.gaps);
  const stronger = strongerGaps(job, match);
  if (gaps.length === 0 && stronger.length === 0) return [];

  const prompt = await gapQuestionsPrompt({ profile, job, gaps, stronger });

  const { questions } = await askModel({
    feature: "tailor-gap-questions",
    prompt,
    schema: GapQuestionListSchema,
    // Mock mode asks only about the gaps: a template question for a strength would only repeat what the CV shows.
    sample: { questions: gaps.map(defaultGapQuestion) },
    // Tying a requirement to the person's own roles needs more thought than low gave (pilot, 7 Nov).
    effort: "medium",
    requester,
  });

  // A gap the model left out is one the CV already covers or that gives no CV line.
  return pickQuestions(questions, gaps, stronger);
}

/**
 * The request text for the gap questions: the whole ad, the CV without contact details, the gaps to ask about and
 * the strengths to make stronger. The kept questions are keyed on this text (#416), so a change here asks again once.
 */
export function gapQuestionsPrompt(input: { profile: Profile; job: Job; gaps: Gap[]; stronger?: Gap[] }): Promise<string> {
  const { profile, job, gaps, stronger = [] } = input;
  return loadPrompt("tailor-gap-questions", {
    job: jobForPrompt(job, { withAd: true }),
    cv: JSON.stringify({ summary: profile.summary, skills: profile.skills, experience: profile.experience, education: profile.education, certifications: profile.certifications, languages: profile.languages, projects: profile.projects }, null, 2),
    gaps: JSON.stringify(gaps, null, 2),
    stronger: JSON.stringify(stronger, null, 2),
  });
}
