// The final check before download: the tailored CV read the way a UK recruiter would, with plain rules and no model.
// Pure code, so the page and the tests share it. No dates rule: the Profile requires a start date for every role.
import { findBrandProblems } from "./brand-check";
import { normalise } from "./nothing-invented";
import type { TailoredCv } from "./tailored-cv";

export type FinalCheckId = "first-person" | "duty-lines" | "repeats" | "us-spelling";

/** One rule, and what on the CV breaks it, each line once: empty when the CV passes. */
export type FinalCheckItem = { id: FinalCheckId; found: string[] };

/** "I", "I'm", "my" and "me" as whole words. A UK CV leaves them out. "I" only in capitals, so "i.e." stays. */
const firstPerson = /(?<![\p{L}'’])(?:I|I['’]m|I['’]ve|I['’]d|I['’]ll|[Mm]y|[Mm]e)(?![\p{L}'’])/gu;

/** Words before a Roman numeral I: "Phase I trials", "Level I", "Type I diabetes" are not about the writer. */
const numeralBefore = /\b(?:phase|level|type|stage|class|part|tier|grade|year|module|unit|section|world war)\s+$/i;

function usesFirstPerson(text: string): boolean {
  return [...text.matchAll(firstPerson)].some((match) => {
    if (match[0] !== "I") return true;
    // "I&C loops", "I/O cards", "I-beams" and "I.T." are not the word "I".
    const next = text.charAt(match.index + 1);
    if (next !== "" && "&/-.".includes(next)) return false;
    return !numeralBefore.test(text.slice(0, match.index));
  });
}

/** A line that says what the job was, not what the person did. */
const dutyLine = /^\s*(?:responsible for|duties (?:included|include|were)|worked on|involved in|tasked with|in charge of)\b/i;

/** Each line once, as it is first written: "Ran tests" and "Ran tests." are the same line. */
function once(lines: string[]): string[] {
  const kept = new Map<string, string>();
  for (const text of lines) if (!kept.has(normalise(text))) kept.set(normalise(text), text);
  return [...kept.values()];
}

export function finalCheck(cv: TailoredCv): FinalCheckItem[] {
  const entryLines = [...cv.experience, ...cv.projects].flatMap((entry) => entry.lines.map((line) => line.text)).filter((text) => text.trim() !== "");
  // The lines the user wrote as sentences: the summary and the lines under each job and project.
  const prose = [cv.summary?.text ?? "", ...entryLines].filter((text) => text.trim() !== "");

  const counts = new Map<string, { first: string; count: number }>();
  for (const text of entryLines) {
    const key = normalise(text);
    const seen = counts.get(key);
    counts.set(key, { first: seen?.first ?? text, count: (seen?.count ?? 0) + 1 });
  }
  const repeats = [...counts.values()].filter((item) => item.count > 1).map((item) => item.first);

  const spellings = prose.flatMap((text) => findBrandProblems(text).filter((problem) => problem.kind === "us-spelling"));
  const usSpelling = [...new Set(spellings.map((problem) => `${problem.found} → ${problem.suggestion}`))];

  return [
    { id: "first-person", found: once(prose.filter(usesFirstPerson)) },
    { id: "duty-lines", found: once(entryLines.filter((text) => dutyLine.test(text))) },
    { id: "repeats", found: repeats },
    { id: "us-spelling", found: usSpelling },
  ];
}
