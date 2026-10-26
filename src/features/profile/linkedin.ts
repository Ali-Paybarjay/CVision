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
// their ids, as in match.ts. The code then keeps a line only when it rests on that role's own duties and results (or
// the user's answers about it) and says nothing they don't: every word comes from those lines, apart from small
// linking words and a change of tense; every figure counts the same thing; a rank word such as "senior" or "lead"
// is used as the lines use it (Nothing invented, Sounds like you). Titles, companies and dates come from the CV
// itself, never from the model. Nothing is saved and nothing is sent to LinkedIn: the user copies what they want.

/** At most this many lines for one role: a short description gets read. */
export const MAX_LINES_PER_ROLE = 5;
/** At most this many skills for one role. */
export const MAX_SKILLS_PER_ROLE = 5;
/** Longer than any line worth a place on LinkedIn, whose descriptions hold 2,000 characters in all. */
export const MAX_LINE_CHARACTERS = 250;

/** The model's answer (see prompts/profile-linkedin-experience.md). */
export const LinkedInAnswerSchema = z.object({
  roles: z.array(
    z.object({
      /** The role's id, e.g. "R1". */
      role: z.string(),
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
  /** False when the line is the user's own words, unchanged. */
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

/** A suggestion that was left out because the profile doesn't back it up, and why: for the tests and the prompt evals. */
export type RejectedSuggestion = { role: string; text: string; reason: string };

/**
 * Turns the model's answer into what the user sees. Each line is checked against the lines it says it rests on
 * (checkLine, checkWriting); anything they don't back up is left out and listed in `rejected`. Roles with nothing
 * left go to `otherRoles`. The ad's requirements the match found no clear evidence for go to `notShown`, so the user
 * knows why no line mentions them.
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
  const findings = requirementFindings(match);
  const blocked = blockedWords(job, findings);
  const rejected: RejectedSuggestion[] = [];

  const answers = new Map<string, RoleAnswer>();
  for (const item of answer.roles) {
    const id = normaliseId(item.role);
    // A second answer for the same role is ignored: the first one already says what to write.
    if (answers.has(id)) continue;
    if (roles.some((role) => role.id === id)) {
      answers.set(id, item);
      continue;
    }
    for (const text of [...item.lines.map((line) => line.text), ...item.skills]) {
      if (text.trim()) rejected.push({ role: id, text, reason: `There is no role ${id} on the profile.` });
    }
  }

  const suggested: LinkedInRole[] = [];
  const otherRoles: string[] = [];
  for (const [index, role] of roles.entries()) {
    const item = answers.get(role.id);

    const kept: LinkedInLine[] = [];
    for (const line of item?.lines ?? []) {
      const result = checkLine(line, role, lines, owners, blocked);
      if (!result) continue;
      if ("reason" in result) rejected.push({ role: role.id, text: line.text, reason: result.reason });
      else if (!kept.some((other) => sameWords(other.text, result.line.text))) kept.push(result.line);
    }

    const own = [role.role, ...role.lines].map((line) => line.text);
    const skills: string[] = [];
    for (const value of item?.skills ?? []) {
      const skill = skillLine(value, shared);
      if (!skill) rejected.push({ role: role.id, text: value, reason: "It is not a skill on the profile." });
      else if (!shows(own, skill.text)) rejected.push({ role: role.id, text: skill.text, reason: "The role's own lines don't show this skill." });
      else if (!skills.includes(skill.text)) skills.push(skill.text);
    }

    if (kept.length === 0 && skills.length === 0) {
      otherRoles.push(role.role.text);
      continue;
    }
    suggested.push({
      ...roleDetails(role, roles.slice(0, index)),
      lines: kept.slice(0, MAX_LINES_PER_ROLE),
      skills: skills.slice(0, MAX_SKILLS_PER_ROLE),
    });
  }

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

/**
 * One written line, checked against the lines it says it rests on. Only this role's duties and results count as
 * evidence, and the user's answers when they are about this role: the summary, skills, education and certificates say
 * nothing about what the person did in it. Null for an empty line, which is simply not shown.
 */
function checkLine(
  line: RoleAnswer["lines"][number],
  role: RoleBlock,
  lines: Map<string, EvidenceLine>,
  owners: Map<string, string>,
  blocked: Set<string>,
): { line: LinkedInLine } | { reason: string } | null {
  const text = tidy(line.text);
  if (!text) return null;

  const own: EvidenceLine[] = [];
  const answers: EvidenceLine[] = [];
  for (const id of new Set(line.from.map(normaliseId))) {
    const source = lines.get(id);
    if (!source) return { reason: `${id} is not a line of the profile.` };
    const owner = owners.get(id);
    if (owner && owner !== role.id) return { reason: `${id} belongs to another role.` };
    if (source.kind === "duty" || source.kind === "achievement") own.push(source);
    else if (source.kind === "answer" && isAbout(source, role)) answers.push(source);
  }
  const sources = [...own, ...answers];
  if (sources.length === 0) return { reason: "It rests on no duty or result of this role, and on no answer about it." };

  const problem = checkWriting(text, {
    evidence: [role.role.text, ...sources.map((source) => source.text)],
    anchors: [role.role.text, ...own.map((source) => source.text)],
    blocked,
  });
  if (problem) return { reason: problem };

  return {
    line: {
      text,
      sources: sources.map(({ kind, text: source }) => ({ kind, text: source })),
      reworded: !sources.some((source) => sameWords(source.text, text)),
    },
  };
}

/** True when an answer, or the question it answers, shares a word that says something with the role's own lines. */
function isAbout(answer: EvidenceLine, role: RoleBlock): boolean {
  const roleWords = contentStems([role.role, ...role.lines].map((line) => line.text));
  return [...contentStems([answer.text, answer.context ?? ""])].some((word) => roleWords.has(word));
}

/**
 * Why a written line says more than its evidence, or null when everything in it is backed up:
 * - every figure counts the same thing as in one of the lines, with no "over", "nearly" or "+" added;
 * - every word is a word of the lines (in any tense or number), a shortening of one ("prep"), a standard abbreviation
 *   of words they have ("P&L"), or a small linking word;
 * - the first word, usually the verb, starts a clause in the lines and acts on the same thing there;
 * - a rank word ("senior", "lead", "manager") follows the same word as in the lines, so "two senior developers" can't
 *   become "Senior developer";
 * - a word of a requirement the match found missing or unclear is in `anchors`, the role's own lines, not only in an
 *   answer that might say the opposite ("I have never used Power BI").
 */
export function checkWriting(text: string, lines: { evidence: string[]; anchors?: string[]; blocked?: Set<string> }): string | null {
  if (text.length > MAX_LINE_CHARACTERS) return "It is too long for one line.";
  const evidence = lines.evidence.map(tokens);
  const written = tokens(text);

  const figures = new Set(evidence.flatMap(figureKeys).map((figure) => figure.key));
  const figure = figureKeys(written).find((item) => !figures.has(item.key));
  if (figure) return `It says "${figure.shown}", which its lines don't say that way.`;

  const stems = stemSet(evidence.flat());
  const sourceWords = evidence.flat().flatMap((token) => (token.type === "word" ? [token.word] : []));
  const word = written.find((token) => token.type === "word" && !GLUE.has(token.word) && !backed(token, stems, sourceWords));
  if (word) return `It says "${word.shown}", which its lines don't.`;

  // The main verb keeps its object and its place: "Coordinated the move" can't borrow "Led" from "Led a team" to
  // become "Led the move", and "Helped manage the stock count" can't become "Managed the stock count".
  const first = written.findIndex((token) => !(token.type === "word" && GLUE.has(token.word)));
  const verb = written[first];
  if (verb?.type === "word") {
    const object = nextContent(written, first);
    const sameUse = evidence.some((line) =>
      line.some((other, at) => other.type === "word" && other.stem === verb.stem && other.clause && nextContent(line, at) === object),
    );
    if (!sameUse) return `It starts with "${verb.shown}" in a way its lines don't.`;
  }

  for (const [index, token] of written.entries()) {
    if (token.type !== "word" || !RANKS.has(token.stem)) continue;
    const before = keyOf(written[index - 1]);
    const usedSo = evidence.some((line) => line.some((other, at) => other.type === "word" && other.stem === token.stem && keyOf(line[at - 1]) === before));
    if (!usedSo) return `It calls the person "${token.shown}" in a way its lines don't.`;
  }

  const anchors = stemSet((lines.anchors ?? lines.evidence).flatMap(tokens));
  const missing = written.find((token) => token.type === "word" && lines.blocked?.has(token.stem) && !anchors.has(token.stem));
  if (missing) return `It adds "${missing.shown}", which your CV doesn't show for this role.`;
  return null;
}

/** `clause`: the token starts a clause, so it can be the line's main verb ("Cleaned and joined…", "…report, cutting…"). */
type Token =
  | { type: "word"; word: string; stem: string; shown: string; clause: boolean }
  | { type: "figure"; value: string; money: boolean; percent: boolean; plus: boolean; shown: string; clause: boolean };

/** Figures (with £, %, "k" or "million"), then words; hyphens and other punctuation split words. */
const TOKEN =
  /(?<![\p{L}\p{N}])(£\s?)?(\d+(?:[.,]\d+)*)(?:\s?(k|m|bn|thousand|million|billion)(?!\p{L}))?(\+)?(\s?%|\s?per\s?cent(?!\p{L}))?|[\p{L}\p{N}]+(?:[&.'’][\p{L}\p{N}]+)*[#+]*/giu;

const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

/** Number words, read as figures: "four new starters" is "4 new starters". Sizes without a figure stay words of their own. */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100", dozen: "12",
  dozens: "dozens", hundreds: "hundreds", thousands: "thousands", millions: "millions",
};

function tokens(text: string): Token[] {
  const found: Token[] = [];
  const clean = cleanModelText(text).text;
  let end = 0;
  for (const match of clean.matchAll(TOKEN)) {
    const [shown, money, digits, scale, plus, percent] = match;
    const previous = found.at(-1);
    const clause =
      !previous || /[,;:–—(]/.test(clean.slice(end, match.index)) || (previous.type === "word" && CLAUSE_LINKS.has(previous.word));
    end = match.index + shown.length;
    if (digits !== undefined) {
      const amount = Number(digits.replace(/,(?=\d{3}(?!\d))/g, "")) * (scale ? SCALES[scale.toLowerCase()] : 1);
      const value = String(Math.round(amount * 1000) / 1000);
      found.push({ type: "figure", value, money: Boolean(money), percent: Boolean(percent), plus: Boolean(plus), shown, clause });
      continue;
    }
    // "KPIs" is the plural of "KPI"; the stem can't tell, as it keeps "analysis" whole.
    const word = (/^\p{Lu}{2,}s$/u.test(shown) ? shown.slice(0, -1) : shown).toLowerCase().replace(/['’]s$/, "");
    const number = NUMBER_WORDS[word];
    if (number) found.push({ type: "figure", value: number, money: false, percent: false, plus: false, shown, clause });
    else found.push({ type: "word", word, stem: stem(word), shown, clause });
  }
  return found;
}

/**
 * Words after which a new clause starts: "Cleaned and joined", "…by automating", and "I" or "we" in the user's
 * answers ("Every Monday I walked…"). Not "to": "helped to manage".
 */
const CLAUSE_LINKS = new Set(["and", "or", "then", "while", "by", "also", "i", "we"]);

/** Words that only link others; they claim nothing, so a line may add them. */
const GLUE = new Set(
  (
    "a an the and or but nor of to in on at for by with from into onto as via per its it their them they this that " +
    "these those which who whose while when where across through throughout within during after before between " +
    "including using also so such then up out"
  ).split(" "),
);

/** Words that change what a figure says: "over 120 stores" is not "120 stores". */
const MODIFIERS = new Set(
  "over under than nearly almost about around approximately roughly circa more less fewer least most above below exceeding by".split(" "),
);

/**
 * A figure with what it counts, so it can only be used as the evidence uses it: "classes of 30" is not "30 classes",
 * "£9 million" is not "9 stores", and "from 2.1% to 1.3%" is not "by 2.1%". A year is just a year.
 */
function figureKeys(line: Token[]): { key: string; shown: string }[] {
  return line.flatMap((token, index) => {
    if (token.type !== "figure") return [];
    const [before, beforeThat, after] = [line[index - 1], line[index - 2], line[index + 1]];
    const isWord = (other: Token | undefined, word?: string): other is Extract<Token, { type: "word" }> =>
      other?.type === "word" && (word === undefined ? !GLUE.has(other.word) : other.word === word);
    if (!token.money && !token.percent && !token.plus && /^(19|20)\d\d$/.test(token.value)) {
      return [{ key: `${token.value}|year`, shown: token.shown }];
    }

    let unit = token.money ? "£" : token.percent ? "%" : "";
    if (!unit) {
      if (isWord(after)) unit = `${after.stem} counted`;
      else if (isWord(before, "of") && isWord(beforeThat)) unit = `of ${beforeThat.stem}`;
      else if (isWord(before)) unit = `${before.stem} numbered`;
    }
    const modifier = token.plus
      ? "+"
      : before?.type === "word" && MODIFIERS.has(before.word)
        ? before.word
        : isWord(before, "to") && isWord(beforeThat, "up")
          ? "up to"
          : "";
    return [{ key: `${token.value}|${unit}|${modifier}`, shown: token.shown }];
  });
}

/** Past forms that don't end in -ed, so a change of tense keeps the same word. Above the sets that stem their words. */
const IRREGULAR: Record<string, string> = {
  led: "lead", ran: "run", built: "build", taught: "teach", wrote: "write", written: "write", kept: "keep",
  sold: "sell", made: "make", held: "hold", won: "win", grew: "grow", grown: "grow", bought: "buy", brought: "bring",
  began: "begin", begun: "begin", gave: "give", given: "give", took: "take", taken: "take", met: "meet", sent: "send",
  spent: "spend", told: "tell", thought: "think", found: "find", rose: "rise", risen: "rise", did: "do", done: "do",
  went: "go", gone: "go", saw: "see", seen: "see", chose: "choose", chosen: "choose", drove: "drive", driven: "drive",
  spoke: "speak", spoken: "speak", understood: "understand", stood: "stand", paid: "pay", said: "say", heard: "hear",
  felt: "feel", lost: "lose", caught: "catch", dealt: "deal", meant: "mean", learnt: "learn", used: "use",
};

/** Ranks and titles: a line may only use them as its evidence does. */
const RANKS = new Set(
  "senior lead leader head chief principal manager director supervisor owner founder executive president".split(" ").map(stem),
);

/** Standard abbreviations, with the words they stand for: "P&L" for "profit and loss". */
const ABBREVIATIONS: Record<string, string[]> = {
  "p&l": ["profit", "loss"].map(stem),
  kpi: ["key", "performance", "indicator"].map(stem),
};

function keyOf(token: Token | undefined): string {
  if (!token) return "^";
  return token.type === "word" ? token.stem : token.value;
}

/** The first word or figure after a token that isn't a linking word: what the verb acts on. "$" at the end. */
function nextContent(line: Token[], index: number): string {
  const next = line.slice(index + 1).find((token) => !(token.type === "word" && GLUE.has(token.word)));
  return next ? keyOf(next) : "$";
}

/** The stems of these tokens' words, with the words a standard abbreviation among them stands for. */
function stemSet(line: Token[]): Set<string> {
  const stems = new Set<string>();
  for (const token of line) {
    if (token.type !== "word") continue;
    stems.add(token.stem);
    for (const part of ABBREVIATIONS[token.stem] ?? []) stems.add(part);
  }
  return stems;
}

/** A word of the evidence in any form, a shortening of one ("prep" for "preparation"), or an abbreviation of its words. */
function backed(token: Extract<Token, { type: "word" }>, stems: Set<string>, sourceWords: string[]): boolean {
  if (stems.has(token.stem)) return true;
  if (token.word.length >= 4 && sourceWords.some((word) => word.length > token.word.length && word.startsWith(token.word))) return true;
  return ABBREVIATIONS[token.stem]?.every((part) => stems.has(part)) ?? false;
}

/** A rough stem, so tense and number don't count as new words: "Managed", "managing" and "manages" give "manag". */
function stem(word: string): string {
  let result = IRREGULAR[word] ?? word;
  // Names such as "P&L", "Node.js" and "C#" are kept whole.
  if (!/^[a-z]+$/.test(result)) return result;
  if (result.length > 4 && result.endsWith("ies")) result = `${result.slice(0, -3)}y`;
  else if (result.length > 4 && /(ss|x|z|ch|sh)es$/.test(result)) result = result.slice(0, -2);
  else if (result.length > 3 && result.endsWith("s") && !/(ss|us|is)$/.test(result)) result = result.slice(0, -1);
  if (result.length > 5 && result.endsWith("ing")) result = result.slice(0, -3);
  else if (result.length > 4 && result.endsWith("ed")) result = result.slice(0, -2);
  if (/([b-df-hj-km-np-rt-vxz])\1$/.test(result)) result = result.slice(0, -1);
  if (result.length > 3 && result.endsWith("e")) result = result.slice(0, -1);
  return result;
}

/** Words too common to show that two lines are about the same thing. */
const COMMON = new Set(
  (
    "work year time help make people thing week month every your were have been what there would could should will " +
    "more most some many much very just only over than used"
  )
    .split(" ")
    .map(stem),
);

/** The stems of the words that say something: four letters or more, and not linking or common words. */
function contentStems(texts: string[]): Set<string> {
  const stems = texts.flatMap(tokens).flatMap((token) => (token.type === "word" && token.word.length >= 4 && !GLUE.has(token.word) ? [token.stem] : []));
  return new Set(stems.filter((word) => !COMMON.has(word)));
}

/**
 * The words of the requirements the match found missing or unclear, as stems, and run together for names such as
 * "PowerBI". A line may use one only where the role's own lines do.
 */
function blockedWords(job: Job, findings: Map<string, "met" | "unclear" | "missing">): Set<string> {
  const words = jobRequirements(job)
    .filter((requirement) => findings.get(requirement.text) === "missing" || findings.get(requirement.text) === "unclear")
    .flatMap((requirement) =>
      requirement.text.split(/\s+or\s+|[/,;()]/i).flatMap((option) => {
        const parts = keywords(option).map((part) => stem(part.toLowerCase()));
        return parts.length > 1 ? [...parts, parts.join("")] : parts;
      }),
    );
  return new Set(words);
}

/** A skill the model named, by its line id or, failing that, by its exact words. */
function skillLine(value: string, shared: EvidenceLine[]): EvidenceLine | undefined {
  const skills = shared.filter((line) => line.kind === "skill");
  const id = normaliseId(value);
  return skills.find((line) => line.id === id) ?? skills.find((line) => sameWords(line.text, value));
}

/**
 * True when the role's lines name what the skill is about: the first word of one of its alternatives, or the words
 * it stands for. "Python (pandas)" is shown by "using SQL and Python", "P&L management" by "profit and loss", but not
 * by "Managed deliveries", which only shares the general word.
 */
function shows(lines: string[], skill: string): boolean {
  const stems = stemSet(lines.flatMap(tokens));
  const heads = skill.split(/\s+or\s+|[/,;()]/i).flatMap((option) => keywords(option).slice(0, 1));
  return heads.some((word) => {
    const head = stem(word.toLowerCase());
    return stems.has(head) || (ABBREVIATIONS[head]?.every((part) => stems.has(part)) ?? false);
  });
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

/**
 * "Customer Assistant (part-time)" → "Customer Assistant", Part-time; "Data Analyst Intern" → itself, Internship.
 * Only a note in brackets or the title's last word counts: an "Internship Coordinator" is not an intern.
 */
export function linkedInTitle(cvTitle: string): { title: string; employmentType: string | null } {
  const trimmed = cvTitle.trim();
  const note = /\s*\(([^()]+)\)$/.exec(trimmed);
  const type = note && EMPLOYMENT_NOTES.find(([pattern]) => pattern.test(note[1].trim()));
  const title = note && type ? trimmed.slice(0, note.index).trim() : "";
  if (type && title) return { title, employmentType: type[1] };
  if (/\bintern(ship)?$/i.test(trimmed)) return { title: cvTitle, employmentType: "Internship" };
  if (/\bapprentice(ship)?$/i.test(trimmed)) return { title: cvTitle, employmentType: "Apprenticeship" };
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
// without the model and is honest by construction.

/** For each role, its duties and results that name the most requirement words, results first when they tie. */
export function suggestByRules(profile: Profile, job: Job): LinkedInAnswer {
  const { roles, shared } = linkedInRoles(profile);
  const wanted = [
    ...new Map(
      jobRequirements(job)
        .flatMap((requirement) => requirement.text.split(/\s+or\s+|[/,;()]/i).flatMap(keywords))
        .map((word) => [word.toLowerCase(), word]),
    ).values(),
  ];
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
