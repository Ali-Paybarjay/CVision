// One fictional person whose CV has languages and projects, and an ad that tempts the model to overstate them.
// No persona has these sections, so the evals in tests/tailor cannot see them (#253).
// The live eval sends this case to the model; the unit test checks that the checks below catch what they should.
import { emmaWithMoreSections as profile } from "@/features/profile/server/sample-cvs";
import { declinedRequirements, defaultGapQuestion, type CoverLetterInput, type GapAnswer } from "@/features/tailor";
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

export const gaps: Gap[] = [testsGap, accessibilityGap, welshGap, signLanguageGap];
export const match: MatchResult = { ...emmaMatch, gaps };

function answerTo(gap: Gap, answer: string, hasExperience: boolean): GapAnswer {
  return { gapId: gap.id, question: defaultGapQuestion(gap).question, answer, hasExperience };
}

/** The sign language level stays unanswered: nothing but the CV speaks for it. */
export const answers: GapAnswer[] = [
  answerTo(testsGap, "Yes. On my Recipe finder project I wrote tests for every component with Vitest.", true),
  answerTo(accessibilityGap, "No, I have not worked to WCAG.", false),
  answerTo(welshGap, "No, I don't speak Welsh.", false),
];

export const input: CoverLetterInput = { profile, job, answers, changes: [], declined: declinedRequirements(gaps, answers, profile) };

/** Nowhere on her CV: what she said no to, tools she did not name, and bigger versions of her ten-minute talk. */
const notOnHerCv = /\b(welsh|wcag|jest|cypress|playwright|mocha|storybook|redux|tailwind|vue|angular|conference|keynote|workshop)\b/gi;

export function wordsNotOnCv(text: string): string[] {
  return [...new Set((text.match(notOnHerCv) ?? []).map((word) => word.toLowerCase()))];
}

/** True when a line gives Spanish (B2 on her CV) or British Sign Language (no level on her CV) a level she does not have. */
export function claimsLevel(line: string): boolean {
  return /\b(spanish|british sign language|bsl)\b/i.test(line) && /\b(fluent|fluently|bilingual|proficient|advanced|c1|c2|level \d)\b/i.test(line);
}

/** The sentences of a letter that claim such a level. Only what follows "I" or "my" counts, so repeating what the ad asks for is fine. */
export function overstatedLevels(letter: string): string[] {
  return letter.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const start = sentence.search(/\b(i|my)\b/i);
    return start !== -1 && claimsLevel(sentence.slice(start));
  });
}

const spelledNumbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Whole numbers only, so the 2 in "B2" is not one, and "2.1" and "32,000" stay whole. */
function numbersIn(text: string): string[] {
  return text.match(/(?<![\p{L}\d])\d+(?:[.,:]\d+)*/gu) ?? [];
}

/** Numbers in the text that are not in her CV, her answers or the ad, as digits or as words up to twelve. */
export function numbersNotInSources(text: string): string[] {
  const sources = JSON.stringify([profile, job, answers]).toLowerCase();
  const known = new Set(numbersIn(sources));
  spelledNumbers.forEach((word, value) => {
    if (new RegExp(`\\b${word}\\b`).test(sources)) known.add(String(value));
  });
  return numbersIn(text).filter((number) => !known.has(number));
}
