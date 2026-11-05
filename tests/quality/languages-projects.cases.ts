// One fictional person whose CV has languages and projects, and an ad that tempts the model to overstate them.
// No persona has these sections, so the evals in tests/tailor cannot see them (#253).
// The live eval sends this case to the model; the unit test checks that the checks below catch what they should.
import { emmaWithMoreSections as profile } from "@/features/profile/server/sample-cvs";
import { declinedRequirements, defaultGapQuestion, type CoverLetterInput, type GapAnswer } from "@/features/tailor";
import { cvLines } from "@/features/tailor/nothing-invented";
import type { Gap, Job, MatchResult } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const { jobs, match: emmaMatch } = personas.emma;
const [testsGap, accessibilityGap] = emmaMatch.gaps;

export const job: Job = {
  ...jobs[0],
  description: `${jobs[0].description}\n\nMany of our patients are deaf or speak Spanish or Welsh, so we also ask for:\n- Spoken Spanish for calls with patients (essential)\n- Welsh speaker (desirable)\n- British Sign Language Level 3 (desirable)`,
  requirements: {
    essential: [...jobs[0].requirements.essential, "Spoken Spanish"],
    desirable: [...jobs[0].requirements.desirable, "Welsh speaker", "British Sign Language Level 3"],
  },
};

const welshGap: Gap = { id: "emma-gap-welsh", requirement: "Welsh speaker", importance: "desirable", kind: "missing", detail: "Welsh is not on the CV." };
const signLanguageGap: Gap = {
  id: "emma-gap-sign-language",
  requirement: "British Sign Language Level 3",
  importance: "desirable",
  kind: "unclear",
  detail: "The CV lists British Sign Language with no level.",
};

export const gaps: Gap[] = [...emmaMatch.gaps, welshGap, signLanguageGap];
export const match: MatchResult = { ...emmaMatch, gaps };

function answerTo(gap: Gap, answer: string, hasExperience: boolean): GapAnswer {
  return { gapId: gap.id, question: defaultGapQuestion(gap).question, answer, hasExperience };
}

/**
 * Her yes names no project, so only the projects section can give a letter Recipe finder or Vitest.
 * The design systems and sign language gaps stay unanswered: nothing but the CV speaks for them.
 */
export const answers: GapAnswer[] = [
  answerTo(testsGap, "Yes, on a project of my own.", true),
  answerTo(accessibilityGap, "No, I have not worked to WCAG.", false),
  answerTo(welshGap, "No, I don't speak Welsh.", false),
];

export const input: CoverLetterInput = { profile, job, answers, changes: [], declined: declinedRequirements(gaps, answers, profile) };

/** Only her projects section holds these. */
export const namesHerProject = /recipe finder|vitest/i;
/** She claims Spanish, or gives the level only her languages section holds. The ad names Spanish, so the word alone proves nothing. */
export const claimsHerSpanish = /\b(?:i|my)\b[^.]*\bspanish\b|\bb2\b/i;

/** Nowhere on her CV: what she said no to, what the ad asks for that she lacks, tools she did not name, and bigger versions of her ten-minute talk. */
const notOnHerCv = /\b(welsh|wcag|accessibility|next\.js|nextjs|design systems?|jest|cypress|playwright|mocha|storybook|redux|tailwind|vue|angular|conference|keynote|workshop)\b/gi;

export function wordsNotOnCv(text: string): string[] {
  return [...new Set((text.match(notOnHerCv) ?? []).map((word) => word.toLowerCase()))];
}

const languages = "spanish|(?:british )?sign language|bsl";
const levels = "fluent|fluently|fluency|bilingual|proficient|proficiency|advanced|c1|c2|level (?:\\d|one|two|three|four|five|six)";
/** The level has to sit next to the language, so "fluent in English and speak Spanish at B2" is not a claim about Spanish. */
const levelNextToLanguage = new RegExp(
  `\\bnative\\W+(?:${languages})\\b|\\b(?:${levels})\\b(?:\\W+\\w+){0,2}?\\W+(?:${languages})\\b|\\b(?:${languages})\\b(?:\\W+\\w+){0,2}?\\W+(?:${levels})\\b`,
  "i",
);

/** True when a line gives Spanish (B2 on her CV) or sign language (no level on her CV) a level she does not have. English, native on her CV, does not count. */
export function claimsLevel(line: string): boolean {
  return levelNextToLanguage.test(line.replace(/(?:\b\w+\s+)?\benglish\b(?:\s*\(\w+\))?/gi, "English"));
}

/** A clause repeating the ad: "you need", "your advert asks for", "the role requires". */
const askedForByTheEmployer = /\b(?:you|your \w+|the \w+)\s+(?:also\s+)?(?:ask|asks|need|needs|want|wants|require|requires|mention|mentions|list|lists|say|says)\b/i;

/** The sentences of a letter that claim such a level. Repeating what the ad asks for is fine. */
export function overstatedLevels(letter: string): string[] {
  return letter
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.split(/[,;]/).some((clause) => !askedForByTheEmployer.test(clause) && claimsLevel(clause)));
}

/** Not "one", which is more often a pronoun than a number. */
const spelledNumbers = new Map(
  Object.entries({
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
    twenty: "20",
    thirty: "30",
    forty: "40",
    fifty: "50",
    sixty: "60",
    seventy: "70",
    eighty: "80",
    ninety: "90",
    hundred: "100",
    thousand: "1000",
  }),
);

/** Numbers as digits or words, as digits. Whole numbers only, so the 2 in "B2" is not one, and "2.1" and "32,000" stay whole. */
function numbersIn(text: string): string[] {
  const digits = text.match(/(?<![\p{L}\d])\d+(?:[.,:]\d+)*/gu) ?? [];
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  return [...digits, ...words.flatMap((word) => spelledNumbers.get(word) ?? [])];
}

const dated = [...profile.experience, ...profile.education, ...(profile.projects ?? [])];
/** What she wrote and the years she gave, not ids, phone digits or the months of her dates, which would make any small number look known. */
const knownNumbers = new Set(
  numbersIn(
    [
      ...cvLines(profile),
      ...dated.flatMap((item) => [item.startDate, item.endDate]).map((date) => (date ?? "").slice(0, 4)),
      ...answers.map((item) => item.answer),
      job.description,
    ].join("\n"),
  ),
);

/** Numbers in the text that are not in her CV, her answers or the ad. */
export function numbersNotInSources(text: string): string[] {
  return numbersIn(text).filter((number) => !knownNumbers.has(number));
}
