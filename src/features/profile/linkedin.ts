import { z } from "zod";
import { cleanModelText } from "@/shared/clean-text";
import type { Job, MatchResult, Profile, WorkExperience } from "@/shared/contracts";
import {
  jobRequirements,
  keywords,
  mentions,
  normaliseId,
  profileEvidenceLines,
  type EvidenceKind,
  type EvidenceLine,
  type Importance,
} from "./match";
import { formatPeriod } from "./ui/format";

// LinkedIn Experience lines: what to write under each role of the user's LinkedIn profile, for one job.
// The model (or, in mock mode, simple rules) writes the lines and points at the profile lines behind each one by
// their ids, as in match.ts. The code then keeps only what those lines back up: a number, a name, or a word from
// the ad or the skills list that they don't contain drops the line, and so does a line written mostly in new words
// (Nothing invented, Sounds like you). Titles, companies and dates come from the CV itself, never from the model.
// Nothing is saved and nothing is sent to LinkedIn: the user copies what they want.

/** At most this many lines for one role: a short description gets read. */
export const MAX_LINES_PER_ROLE = 5;
/** At most this many skills for one role. */
export const MAX_SKILLS_PER_ROLE = 5;
/** Longer than any line worth a place on LinkedIn, whose descriptions hold 2,000 characters in all. */
export const MAX_LINE_CHARACTERS = 250;
/** The share of a written line's words that must come from the profile lines it rests on. */
export const MIN_OWN_WORDS = 0.8;

/** The model's answer (see prompts/profile-linkedin-experience.md). */
export const LinkedInAnswerSchema = z.object({
  roles: z.array(
    z.object({
      /** The role's id, e.g. "R1". */
      role: z.string(),
      /** One sentence on what the person did in the role; empty when its lines don't give enough. */
      intro: z.string(),
      lines: z.array(
        z.object({
          text: z.string(),
          /** The ids of the profile lines it rests on, e.g. ["L11"]. */
          from: z.array(z.string()),
        }),
      ),
      /** The ids of the skill lines the role's own lines show, e.g. ["L4"]. */
      skills: z.array(z.string()),
    }),
  ),
});
export type LinkedInAnswer = z.infer<typeof LinkedInAnswerSchema>;
type RoleAnswer = LinkedInAnswer["roles"][number];

/** One role of the CV, numbered R1, R2… in profile order, with the lines that belong to it. */
export type RoleBlock = {
  id: string;
  experience: WorkExperience;
  /** Its "Title at Company" line. */
  role: EvidenceLine;
  /** Its duties and results. */
  lines: EvidenceLine[];
};

/** The profile's lines by role, with the same ids as match.ts. Summary, skills, education, certificates and answers belong to no role. */
export function linkedInRoles(profile: Profile): { roles: RoleBlock[]; shared: EvidenceLine[] } {
  const roles: RoleBlock[] = [];
  const shared: EvidenceLine[] = [];
  for (const line of profileEvidenceLines(profile)) {
    if (line.kind === "role") {
      // profileEvidenceLines gives one role line for each job, in profile order.
      roles.push({ id: `R${roles.length + 1}`, experience: profile.experience[roles.length], role: line, lines: [] });
    } else if ((line.kind === "duty" || line.kind === "achievement") && roles.length > 0) {
      roles[roles.length - 1].lines.push(line);
    } else {
      shared.push(line);
    }
  }
  return { roles, shared };
}

/** A profile line a suggestion rests on, as the user wrote it. */
export type LinkedInSource = { kind: EvidenceKind; text: string };

export type LinkedInLine = {
  text: string;
  sources: LinkedInSource[];
  /** False when the line is the CV's own words, unchanged. */
  reworded: boolean;
};

export type LinkedInRole = {
  id: string;
  /** For LinkedIn's Title field: the CV's title, without a note such as "(part-time)". */
  title: string;
  /** The title as the CV gives it. */
  cvTitle: string;
  /** For LinkedIn's Employment type field, when the CV's title says it, e.g. "Part-time" or "Internship". */
  employmentType: string | null;
  company: string;
  location: string | null;
  /** "Jun 2025 to Sep 2025", "Mar 2025 to now". */
  period: string;
  /** The title of an earlier role at the same company: LinkedIn lists both under that company. */
  sameCompanyAs: string | null;
  /** One sentence for the start of the description; empty when there is none. */
  intro: string;
  lines: LinkedInLine[];
  skills: string[];
};

/** A requirement of the ad that the profile doesn't show clearly, so no line claims it. */
export type NotShown = { requirement: string; importance: Importance; kind: "missing" | "unclear" };

export type LinkedInSuggestions = {
  /** The roles with something to add, in profile order. */
  roles: LinkedInRole[];
  /** The other roles, as "Title at Company": nothing in them speaks to this job. */
  otherRoles: string[];
  notShown: NotShown[];
  /** How many suggestions were left out because the profile doesn't back them up. */
  dropped: number;
};

/** A suggestion that was left out, and why: for the tests and the prompt evals, never shown or logged. */
export type RejectedSuggestion = { role: string; text: string; reason: string };

/**
 * Turns the model's answer into what the user sees. A line must rest on this role's own duties or results (or the
 * user's answers) and say nothing those lines don't; anything else is left out and listed in `rejected`. Roles with
 * nothing left go to `otherRoles`. The ad's requirements the match found no clear evidence for go to `notShown`, so
 * the user knows why no line mentions them.
 */
export function buildLinkedInSuggestions(
  profile: Profile,
  job: Job,
  match: MatchResult | null,
  answer: LinkedInAnswer,
): { suggestions: LinkedInSuggestions; rejected: RejectedSuggestion[] } {
  const { roles, shared } = linkedInRoles(profile);
  const lines = new Map([...roles.flatMap((role) => [role.role, ...role.lines]), ...shared].map((line) => [line.id, line]));
  const owners = new Map(roles.flatMap((role) => [role.role, ...role.lines].map((line) => [line.id, role.id] as const)));
  const terms = checkedTerms(profile, job);
  const rejected: RejectedSuggestion[] = [];

  const answers = new Map<string, RoleAnswer>();
  for (const item of answer.roles) {
    const id = normaliseId(item.role);
    const reason = !roles.some((role) => role.id === id)
      ? `There is no role ${id} on the profile.`
      : answers.has(id)
        ? `Role ${id} was answered twice.`
        : null;
    if (!reason) {
      answers.set(id, item);
      continue;
    }
    for (const text of [item.intro, ...item.lines.map((line) => line.text), ...item.skills]) {
      if (text.trim()) rejected.push({ role: id, text, reason });
    }
  }

  const suggested: LinkedInRole[] = [];
  const otherRoles: string[] = [];
  for (const [index, role] of roles.entries()) {
    const item = answers.get(role.id);
    const own = [role.role, ...role.lines].map((line) => line.text);

    let intro = tidy(item?.intro ?? "");
    const introProblem = intro && checkWriting(intro, own, terms);
    if (introProblem) {
      rejected.push({ role: role.id, text: intro, reason: introProblem });
      intro = "";
    }

    const kept: LinkedInLine[] = [];
    for (const line of item?.lines ?? []) {
      const result = checkLine(line, role, lines, owners, terms);
      if ("reason" in result) rejected.push({ role: role.id, text: line.text, reason: result.reason });
      else if (!kept.some((other) => sameWords(other.text, result.line.text))) kept.push(result.line);
    }

    const skills: string[] = [];
    for (const value of item?.skills ?? []) {
      const skill = skillLine(value, shared);
      if (!skill) rejected.push({ role: role.id, text: value, reason: "It is not a skill on the profile." });
      else if (!shows(own, skill.text)) rejected.push({ role: role.id, text: skill.text, reason: "The role's own lines don't show this skill." });
      else if (!skills.includes(skill.text)) skills.push(skill.text);
    }

    if (!intro && kept.length === 0 && skills.length === 0) {
      otherRoles.push(role.role.text);
      continue;
    }
    suggested.push({
      ...roleDetails(role, roles.slice(0, index)),
      intro,
      lines: kept.slice(0, MAX_LINES_PER_ROLE),
      skills: skills.slice(0, MAX_SKILLS_PER_ROLE),
    });
  }

  const findings = requirementFindings(match);
  const notShown = jobRequirements(job).flatMap(({ text, importance }) => {
    const kind = findings.get(text);
    return kind === "missing" || kind === "unclear" ? [{ requirement: text, importance, kind }] : [];
  });
  return { suggestions: { roles: suggested, otherRoles, notShown, dropped: rejected.length }, rejected };
}

/** What the match found for each requirement, by its words. A requirement it lists as uncovered counts as missing. */
export function requirementFindings(match: MatchResult | null): Map<string, "met" | "unclear" | "missing"> {
  const findings = new Map<string, "met" | "unclear" | "missing">();
  for (const strength of match?.strengths ?? []) findings.set(strength.requirement, "met");
  for (const gap of match?.gaps ?? []) findings.set(gap.requirement, gap.kind);
  for (const requirement of match?.uncoveredRequirements ?? []) {
    if (!findings.has(requirement)) findings.set(requirement, "missing");
  }
  return findings;
}

/** One written line, checked against the profile lines it says it rests on. */
function checkLine(
  line: RoleAnswer["lines"][number],
  role: RoleBlock,
  lines: Map<string, EvidenceLine>,
  owners: Map<string, string>,
  terms: string[],
): { line: LinkedInLine } | { reason: string } {
  const text = tidy(line.text);
  if (!text) return { reason: "The line is empty." };

  const ids = [...new Set(line.from.map(normaliseId))];
  if (ids.length === 0) return { reason: "The line points at no line of the profile." };
  const sources: EvidenceLine[] = [];
  for (const id of ids) {
    const source = lines.get(id);
    if (!source) return { reason: `${id} is not a line of the profile.` };
    const owner = owners.get(id);
    if (owner && owner !== role.id) return { reason: `${id} belongs to another role.` };
    sources.push(source);
  }
  // Another role's lines were turned away above, so a duty or result here is this role's own.
  if (!sources.some((source) => source.kind === "duty" || source.kind === "achievement" || source.kind === "answer")) {
    return { reason: "None of its lines is a duty or result of this role, or one of the user's answers." };
  }

  const problem = checkWriting(text, [role.role.text, ...sources.map((source) => source.text)], terms);
  if (problem) return { reason: problem };

  const shown = sources.filter((source) => source.kind !== "role");
  return {
    line: {
      text,
      sources: shown.map(({ kind, text: source }) => ({ kind, text: source })),
      reworded: !shown.some((source) => sameWords(source.text, text)),
    },
  };
}

/**
 * Why a written line or intro says more than its evidence, or null when everything in it is backed up: every number,
 * every name with a capital letter and every word of the ad's requirements or the skills list must be in the evidence,
 * and most of its other words too.
 */
export function checkWriting(text: string, evidence: string[], terms: string[]): string | null {
  if (text.length > MAX_LINE_CHARACTERS) return "It is too long for one line.";
  const source = evidence.map((line) => cleanModelText(line).text).join("\n");

  const backed = numbersIn(source);
  const number = [...numbersIn(text)].find((item) => !backed.has(item));
  if (number) return `It says "${number}", which its lines don't.`;

  const name = namesIn(text).find((item) => !namedIn(source, item));
  if (name) return `It names "${name}", which its lines don't.`;

  const term = terms.find((item) => mentions(text, item) && !mentions(source, item));
  if (term) return `It adds "${term}", which its lines don't mention.`;

  if (ownWordShare(text, source) < MIN_OWN_WORDS) return "Most of its words are not in its lines.";
  return null;
}

/** Number words a line may use for a figure in its evidence, or the other way round ("four new starters"). */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100", dozen: "12",
  // Sizes without a figure still claim a scale ("hundreds of customers").
  dozens: "dozens", hundreds: "hundreds", thousands: "thousands", millions: "millions",
  thousand: "thousand", million: "million", billion: "billion",
};
const SCALE_SUFFIXES: Record<string, string> = { k: "thousand", m: "million", bn: "billion" };

/** The figures in a text, as digits ("1,100" → "1100"), with "£9m" read as "9" and "million". */
function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)*)(?:\s?(k|m|bn)(?!\p{L}))?/giu)) {
    found.add(match[1].replace(/,(?=\d{3}(?!\d))/g, ""));
    const scale = match[2] && SCALE_SUFFIXES[match[2].toLowerCase()];
    if (scale) found.add(scale);
  }
  for (const match of text.toLowerCase().matchAll(/\p{L}+/gu)) {
    const number = NUMBER_WORDS[match[0]];
    if (number) found.add(number);
  }
  return found;
}

/** Words with a capital letter that don't start a sentence: tools, places, qualifications ("Power BI", "NHS", "TypeScript"). */
function namesIn(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}+#&.'’-]*/gu)) {
    const word = match[0].replace(/[.'’-]+$/, "");
    if (!/\p{Lu}/u.test(word)) continue;
    const before = text.slice(0, match.index).trimEnd();
    if (before === "" || /[.!?]$/.test(before)) continue;
    names.push(word);
  }
  return names;
}

/** True when the text names it as a whole word, allowing a plural or a possessive: "KPI" finds "KPIs". */
function namedIn(text: string, name: string): boolean {
  const base = name.length > 3 ? name.replace(/(?:'s|’s|s)$/, "") : name;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?:s|es|'s|’s)?($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** Common words with no claim of their own, left out when measuring how much of a line is the user's words. */
const COMMON = new Set(
  (
    "about across after also before being between both could during each every from have into more most only onto " +
    "other over same some such than that their them then there these they this those through under very were what " +
    "when where which while with within without would your"
  ).split(" "),
);

/**
 * The share of a line's words (four letters or more) that its evidence uses too, in any form: "Built" counts for
 * "Build", "prep" for "preparation" and "managers" for "manage".
 */
function ownWordShare(text: string, source: string): number {
  const sourceWords = wordsOf(source).filter((word) => word.length >= 4);
  // Figures written as words ("four") are checked as figures already.
  const words = wordsOf(text).filter((word) => word.length >= 4 && !COMMON.has(word) && !(word in NUMBER_WORDS));
  if (words.length === 0) return 1;
  const used = words.filter((word) => sourceWords.some((other) => other.startsWith(word.slice(0, 4)) || word.startsWith(other)));
  return used.length / words.length;
}

/** The words of a text in lower case, without a possessive: "Parents' evenings" gives "parents" and "evenings". */
function wordsOf(text: string): string[] {
  return [...text.toLowerCase().matchAll(/\p{L}[\p{L}'’]*/gu)].map((match) => match[0].replace(/['’]s$|['’]$/, ""));
}

/** The words checked in every written line: those of the ad's requirements and of the profile's skills. */
function checkedTerms(profile: Profile, job: Job): string[] {
  const phrases = [...jobRequirements(job).map((requirement) => requirement.text), ...profile.skills];
  return uniqueWords(phrases.flatMap(phraseWords));
}

/** The words of a requirement or skill, each alternative on its own: "Python or R (pandas)" gives Python, R and pandas. */
function phraseWords(phrase: string): string[] {
  return phrase.split(/\s+or\s+|[/,;()]/i).flatMap(keywords);
}

function uniqueWords(words: string[]): string[] {
  return [...new Map(words.map((word) => [word.toLowerCase(), word])).values()];
}

/** A skill the model named, by its line id or, failing that, by its exact words. */
function skillLine(value: string, shared: EvidenceLine[]): EvidenceLine | undefined {
  const skills = shared.filter((line) => line.kind === "skill");
  const id = normaliseId(value);
  return skills.find((line) => line.id === id) ?? skills.find((line) => sameWords(line.text, value));
}

/**
 * True when the role's lines name what the skill is about: the first word of one of its alternatives. "Python (pandas)"
 * is shown by "using SQL and Python" and "Stock control" by "stock levels", but "P&L management" is not shown by
 * "Managed deliveries", which only shares the general word.
 */
function shows(lines: string[], skill: string): boolean {
  const heads = skill.split(/\s+or\s+|[/,;()]/i).flatMap((option) => keywords(option).slice(0, 1));
  return heads.some((word) => lines.some((line) => mentions(line, word)));
}

/** What LinkedIn asks for besides the description: the CV's own title, company, place and dates. */
function roleDetails(role: RoleBlock, earlier: RoleBlock[]) {
  const { title, company, location, startDate, endDate } = role.experience;
  const sameCompany = earlier.find((other) => sameWords(other.experience.company, company));
  return {
    id: role.id,
    ...linkedInTitle(title),
    cvTitle: title,
    company,
    location: location?.trim() || null,
    period: formatPeriod(startDate, endDate),
    sameCompanyAs: sameCompany ? sameCompany.experience.title : null,
  };
}

/** Notes in a CV title that LinkedIn keeps in its Employment type field instead. */
const EMPLOYMENT_NOTES: [RegExp, string][] = [
  [/^part[\s-]?time$/i, "Part-time"],
  [/^full[\s-]?time$/i, "Full-time"],
  [/^(fixed[\s-]?term\s+)?contract$/i, "Contract"],
  [/^freelance$/i, "Freelance"],
  [/^self[\s-]?employed$/i, "Self-employed"],
  [/^seasonal$/i, "Seasonal"],
  [/^intern(ship)?$/i, "Internship"],
  [/^apprentice(ship)?$/i, "Apprenticeship"],
];

/** "Customer Assistant (part-time)" → "Customer Assistant", Part-time; "Data Analyst Intern" → itself, Internship. */
export function linkedInTitle(cvTitle: string): { title: string; employmentType: string | null } {
  const note = /\s*\(([^()]+)\)\s*$/.exec(cvTitle);
  const type = note && EMPLOYMENT_NOTES.find(([pattern]) => pattern.test(note[1].trim()));
  const title = note && type ? cvTitle.slice(0, note.index).trim() : "";
  if (type && title) return { title, employmentType: type[1] };
  if (/\bintern(ship)?\b/i.test(cvTitle)) return { title: cvTitle, employmentType: "Internship" };
  if (/\bapprentice(ship)?\b/i.test(cvTitle)) return { title: cvTitle, employmentType: "Apprenticeship" };
  return { title: cvTitle, employmentType: null };
}

/** Text as it should be copied: no hidden characters, no bullet of its own and one space between words. */
function tidy(text: string): string {
  return cleanModelText(text)
    .text.replace(/\s+/g, " ")
    .trim()
    .replace(/^[•·*–—-]+\s*/, "");
}

/** The same words, whatever the case, spacing, curly quotes or a full stop at the end. */
function sameWords(a: string, b: string): boolean {
  const plain = (text: string) =>
    tidy(text)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[.;,]+$/, "");
  return plain(a) === plain(b);
}

// The mock answer: each role's own lines that name the ad's requirements, word for word, so the demo works
// without the model and is honest by construction. It adds no intro: that would need writing.

/** For each role, its duties and results that name the most requirement words, results first when they tie. */
export function suggestByRules(profile: Profile, job: Job): LinkedInAnswer {
  const { roles, shared } = linkedInRoles(profile);
  const wanted = uniqueWords(jobRequirements(job).flatMap((requirement) => phraseWords(requirement.text)));
  const relevance = (text: string) => wanted.filter((word) => mentions(text, word)).length;
  const skillLines = shared.filter((line) => line.kind === "skill");

  return {
    roles: roles.flatMap((role) => {
      const lines = role.lines
        .filter((line) => line.text.length <= MAX_LINE_CHARACTERS)
        .map((line, index) => ({ line, index, score: relevance(line.text) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || resultsFirst(a.line) - resultsFirst(b.line) || a.index - b.index)
        .slice(0, MAX_LINES_PER_ROLE);
      if (lines.length === 0) return [];

      const own = [role.role, ...role.lines].map((line) => line.text);
      const skills = skillLines
        .filter((skill) => shows(own, skill.text))
        .sort((a, b) => relevance(b.text) - relevance(a.text))
        .slice(0, MAX_SKILLS_PER_ROLE);
      return [
        {
          role: role.id,
          intro: "",
          lines: lines.map(({ line }) => ({ text: line.text, from: [line.id] })),
          skills: skills.map((skill) => skill.id),
        },
      ];
    }),
  };
}

function resultsFirst(line: EvidenceLine): number {
  return line.kind === "achievement" ? 0 : 1;
}
