import { z } from "zod";
import { findBrandProblems } from "@/features/tailor/brand-check";
import { cleanModelText } from "@/shared/clean-text";
import type { Job, MatchResult, Profile, WorkExperience } from "@/shared/contracts";
import {
  assessByRules,
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
// their ids, as in match.ts. The code then keeps a line only when it says nothing those lines don't (checkWriting):
// each part of it comes from one of them, word for word apart from the tense and small linking words, with every
// figure counting the same thing and every rank used the same way (Nothing invented, Sounds like you). Titles,
// companies and dates come from the CV itself, never from the model. Nothing is saved and nothing is sent to LinkedIn:
// the user copies what they want.

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
  /** The user's answers about this role (see roleOfAnswer). */
  answers: EvidenceLine[];
};

/**
 * The profile's lines by role, with the same ids as match.ts. Each answer goes to the one role it is about, if any.
 * Summary, skills, education and certificates belong to no role.
 */
export function linkedInRoles(profile: Profile): { roles: RoleBlock[]; shared: EvidenceLine[] } {
  const roles: RoleBlock[] = [];
  const shared: EvidenceLine[] = [];
  for (const line of profileEvidenceLines(profile)) {
    if (line.kind === "role") {
      // profileEvidenceLines gives one role line for each job, in profile order.
      roles.push({ id: `R${roles.length + 1}`, experience: profile.experience[roles.length], role: line, lines: [], answers: [] });
    } else if ((line.kind === "duty" || line.kind === "achievement") && roles.length > 0) {
      roles[roles.length - 1].lines.push(line);
    } else {
      shared.push(line);
    }
  }
  for (const answer of shared.filter((line) => line.kind === "answer")) roleOfAnswer(answer, roles)?.answers.push(answer);
  return { roles, shared };
}

/**
 * Why a profile has nothing to write LinkedIn lines from, or null when it has: no roles at all, or roles with no
 * duties, results or answers, so no line could pass the checks and a model request would be wasted.
 */
export function nothingToWrite(profile: Profile): "no-roles" | "no-lines" | null {
  if (profile.experience.length === 0) return "no-roles";
  return linkedInRoles(profile).roles.every((role) => role.lines.length === 0 && role.answers.length === 0) ? "no-lines" : null;
}

/**
 * The role an answer is about: the one whose company the answer or its question names, otherwise the one it shares
 * the most words with that no other role has (for two roles at one company, the same between those two). None when
 * that isn't clear, so an answer never backs a line under the wrong employer.
 */
function roleOfAnswer(answer: EvidenceLine, roles: RoleBlock[]): RoleBlock | undefined {
  const said = contentStems([answer.text, answer.context ?? ""]);
  const named = roles.filter((role) => said.has(companyKey(role.experience.company)));
  if (new Set(named.map((role) => companyKey(role.experience.company))).size > 1) return undefined;
  if (named.length === 1) return named[0];

  const candidates = named.length > 0 ? named : roles;
  const words = candidates.map((role) => contentStems([role.experience.title, ...role.lines.map((line) => line.text)]));
  const scores = words.map((own, index) => {
    const others = new Set(words.filter((_, other) => other !== index).flatMap((set) => [...set]));
    return [...own].filter((word) => said.has(word) && !others.has(word)).length;
  });
  const best = Math.max(0, ...scores);
  return best > 0 && scores.filter((score) => score === best).length === 1 ? candidates[scores.indexOf(best)] : undefined;
}

/** "Hartley's Home Stores" → "hartley": the word an answer would name the company by. */
function companyKey(company: string): string {
  const first = tokens(company).find((token) => token.type === "word");
  return first?.type === "word" ? first.stem : "";
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
  /** How many suggestions were left out because they couldn't be checked against the profile. */
  dropped: number;
};

/** A suggestion that was left out because the profile doesn't back it up, and why: for the tests and the prompt evals. */
export type RejectedSuggestion = { role: string; text: string; reason: string };

/**
 * Turns the model's answer into what the user sees. Each line is checked against the lines it says it rests on
 * (checkLine, checkWriting); anything they don't back up is left out and listed in `rejected`. Roles with nothing
 * left go to `otherRoles`. The ad's requirements the profile doesn't show clearly go to `notShown`, so the user knows
 * why no line mentions them.
 */
export function buildLinkedInSuggestions(
  profile: Profile,
  job: Job,
  match: MatchResult | null,
  answer: LinkedInAnswer,
): { suggestions: LinkedInSuggestions; rejected: RejectedSuggestion[] } {
  const { roles, shared } = linkedInRoles(profile);
  const lines = new Map([...roles.flatMap((role) => [role.role, ...role.lines]), ...shared].map((line) => [line.id, line]));
  const owners = new Map(roles.flatMap((role) => [role.role, ...role.lines, ...role.answers].map((line) => [line.id, role.id] as const)));
  const findings = currentFindings(profile, job, match);
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
      const result = checkLine(line, role, lines, owners);
      if (!result) continue;
      if ("reason" in result) rejected.push({ role: role.id, text: line.text, reason: result.reason });
      else if (!kept.some((other) => sameWords(other.text, result.line.text))) kept.push(result.line);
    }

    const own = role.lines.map((line) => line.text);
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

type Finding = "met" | "unclear" | "missing";

/** What the match found for each requirement, by its words. A requirement it lists as uncovered counts as missing. */
export function requirementFindings(match: MatchResult | null): Map<string, Finding> {
  const findings = new Map<string, Finding>();
  for (const strength of match?.strengths ?? []) findings.set(strength.requirement, "met");
  for (const gap of match?.gaps ?? []) findings.set(gap.requirement, gap.kind);
  for (const requirement of match?.uncoveredRequirements ?? []) {
    if (!findings.has(requirement)) findings.set(requirement, "missing");
  }
  return findings;
}

/**
 * The match's findings brought up to date with the profile as it is now. The match was saved when the job was
 * checked, so a requirement the user has since shown in a duty or a result counts as met, as the demo's rules find
 * it; a bare skills-list entry doesn't, and neither does an answer, which may say the user hasn't done it. Without a
 * match, the rules decide everything.
 */
export function currentFindings(profile: Profile, job: Job, match: MatchResult | null): Map<string, Finding> {
  const findings = requirementFindings(match);
  const lines = new Map(profileEvidenceLines(profile).map((line) => [line.id, line]));
  const rules = assessByRules(profile, job).requirements;
  for (const [index, requirement] of jobRequirements(job).entries()) {
    const ruled = rules[index];
    const proof = lines.get(ruled.evidence);
    if (ruled.status === "met" && (proof?.kind === "duty" || proof?.kind === "achievement")) findings.set(requirement.text, "met");
    else if (!match) findings.set(requirement.text, ruled.status);
  }
  return findings;
}

/**
 * One written line, checked against the lines it says it rests on. Only this role's duties and results count as
 * evidence, and the user's answers about this role: the summary, skills, education and certificates say nothing
 * about what the person did in it. Null for an empty line, which is simply not shown.
 */
function checkLine(
  line: RoleAnswer["lines"][number],
  role: RoleBlock,
  lines: Map<string, EvidenceLine>,
  owners: Map<string, string>,
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
    else if (source.kind === "answer" && owner === role.id) answers.push(source);
  }
  const sources = [...own, ...answers];
  if (sources.length === 0) return { reason: "It rests on no duty or result of this role, and on no answer about it." };

  const problem = checkWriting(text, { evidence: sources.map((source) => source.text), title: role.experience.title });
  if (problem) return { reason: problem };

  return {
    line: {
      text,
      sources: sources.map(({ kind, text: source }) => ({ kind, text: source })),
      reworded: !sources.some((source) => sameWords(source.text, text)),
    },
  };
}

/**
 * Why a written line says more than its evidence, or null when everything in it is backed up. The line is read in
 * parts, split at punctuation and at words such as "and" or "by", and each part must come from one evidence line:
 * - every word is a word of that line, in any tense or number, a standard shortening or abbreviation of its words
 *   ("prep", "P&L"), or a small linking word, and not a word the line denies ("I never presented…");
 * - every figure counts the same thing there, with no "over", "nearly" or "+" added ("classes of 30" is not "30 classes");
 * - its first word starts a clause in that line and acts on the same thing ("Coordinated the move" can't become
 *   "Coordinated 80 staff", and "Helped manage" can't become "Managed");
 * - a rank word ("senior", "lead", "manager") follows the same word and preposition as there ("with two senior
 *   developers" can't become "Senior developer" or "from two senior developers"); the role's own title may follow "as";
 * - words that limit what the line says, such as "in my classes" or "for the Midlands region", are kept.
 * A part may move on to another line only at that line's own start ("…, and own its profit and loss"); a part that
 * starts with "by" or an -ing verb belongs with the part before it, so one line's result can't be pinned on another's
 * duty.
 */
export function checkWriting(text: string, lines: { evidence: string[]; title?: string }): string | null {
  if (text.length > MAX_LINE_CHARACTERS) return "It is too long for one line.";
  const sources = lines.evidence.map(prepare);
  const written = tokens(text);
  const titled = titleSpan(written, lines.title);
  const whole = stemSet(written);

  let current: number[] | null = null;
  for (const part of parts(written)) {
    const content = part.filter((index) => isContent(written[index]) && !titled.has(index));
    if (content.length === 0) continue;
    const first = written[content[0]];
    const dependent = written[part[0]].link === "by" || (first.type === "word" && first.word.length > 5 && first.word.endsWith("ing"));

    const previous: number[] | null = current;
    const stay: number[] = (previous ?? []).filter((source) => !fit(written, content, sources[source], "continue", whole));
    const move: number[] =
      previous !== null && dependent
        ? []
        : sources.flatMap((source, at) => (fit(written, content, source, previous === null ? "first" : "switch", whole) ? [] : [at]));
    const allowed: number[] = stay.length > 0 ? stay : move;
    if (allowed.length === 0) return partProblem(written, content, sources, previous, dependent, whole);
    current = allowed;
  }
  return null;
}

/** The clearest reason a part fits no evidence line, for the tests, the evals and the count the user sees. */
function partProblem(written: Token[], content: number[], sources: Prepared[], current: number[] | null, dependent: boolean, whole: Set<string>): string {
  const words = content.map((index) => written[index]).filter((token): token is Extract<Token, { type: "word" }> => token.type === "word");
  const unknown = words.find((token) => !sources.some((source) => backedBy(token, source, true)));
  if (unknown) return `It says "${unknown.shown}", which its lines don't.`;
  const denied = !words.some((token) => token.negation) && words.find((token) => !sources.some((source) => backedBy(token, source, false)));
  if (denied) return `It says "${denied.shown}", which its lines say didn't happen.`;
  const first = written[content[0]];
  if (current !== null && dependent && sources.some((source) => !fit(written, content, source, "continue", whole))) {
    return `It joins "${first.shown}" to a line it doesn't come from.`;
  }
  // When the line it goes on with has every word, its own reason (a figure, a rank, a dropped limit) says most.
  const staying = (current ?? []).map((source) => fit(written, content, sources[source], "continue", whole) ?? "");
  const specific = staying.find((reason) => reason && !(reason.startsWith("It says") && !reason.includes("that way")));
  if (specific) return specific;
  const reasons = sources.map((source) => fit(written, content, source, current === null ? "first" : "switch", whole) ?? "");
  const wordReasons = reasons.filter((reason) => reason.startsWith("It says") && !reason.includes("that way"));
  if (wordReasons.length === reasons.length) return "It joins two lines into a claim neither of them makes.";
  return reasons.find((reason) => reason && !wordReasons.includes(reason)) ?? reasons[0];
}

/**
 * Why one part doesn't fit one evidence line, or null when it does. `mode` says how the part follows the one before:
 * "first" (the line's first part), "continue" (more of the same evidence line) or "switch" (another evidence line).
 */
function fit(written: Token[], content: number[], source: Prepared, mode: "first" | "continue" | "switch", whole: Set<string>): string | null {
  const denied = content.some((index) => written[index].negation);
  for (const index of content) {
    const token = written[index];
    if (token.type === "word" && !backedBy(token, source, denied)) return `It says "${token.shown}", which its lines don't.`;
  }
  for (const index of content) {
    const token = written[index];
    if (token.type !== "figure") continue;
    const shown = figureInfo(written, index);
    if (!source.tokens.some((other, at) => other.type === "figure" && sameFigure(shown, figureInfo(source.tokens, at)))) {
      return `It says "${token.shown}", which its lines don't say that way.`;
    }
  }

  const [start, next] = content.map((index) => written[index]);
  const starts = source.tokens.flatMap((other, at) =>
    keyOf(other) === keyOf(start) && (!other.negated || denied) && (mode === "first" ? other.clause : mode === "switch" ? other.fresh : true) ? [at] : [],
  );
  if (starts.length === 0 || (next && !starts.some((at) => inScope(source.tokens, at, next)))) {
    return `It starts with "${start.shown}" in a way its lines don't.`;
  }

  for (const index of content) {
    const token = written[index];
    if (token.type !== "word" || !RANKS.has(token.stem)) continue;
    const preposition = prepositionBefore(written, index);
    const usedSo =
      preposition !== "as" &&
      source.tokens.some((other, at) => {
        if (other.type !== "word" || other.stem !== token.stem || keyOf(source.tokens[at - 1]) !== keyOf(written[index - 1])) return false;
        const theirs = prepositionBefore(source.tokens, at);
        if (theirs !== null && theirs !== preposition) return false;
        // "Head of Year 9" can't become "head of school".
        return !isWord(written[index + 1], "of") || (isWord(source.tokens[at + 1], "of") && keyAfter(source.tokens, at + 1) === keyAfter(written, index + 1));
      });
    if (!usedSo) return `It calls the person "${token.shown}" in a way its lines don't.`;
  }

  const usesLine = content.some((index) => {
    const token = written[index];
    return keyOf(token) === source.start || (token.type === "figure" && source.figures.has(token.value));
  });
  const dropped = usesLine && source.limits.find((limit) => !limit.stems.every((stem) => whole.has(stem)));
  if (dropped) return `It leaves out "${dropped.shown}", which limits what the line says.`;
  return null;
}

/** An evidence line, read once. */
type Prepared = {
  tokens: Token[];
  /** Stems of its words that it doesn't deny, with the words its abbreviations stand for. */
  stems: Set<string>;
  /** The same, the denied words included. */
  allStems: Set<string>;
  words: string[];
  /** The key of its first word that isn't a linking word: usually its verb. */
  start: string;
  figures: Set<string>;
  /** Phrases that limit what it says: "in my classes", "for the Midlands region". */
  limits: { stems: string[]; shown: string }[];
};

function prepare(text: string): Prepared {
  const line = tokens(text);
  const first = line.find(isContent);
  return {
    tokens: line,
    stems: stemSet(line.filter((token) => !token.negated)),
    allStems: stemSet(line),
    words: line.flatMap((token) => (token.type === "word" ? [token.word] : [])),
    start: first ? keyOf(first) : "",
    figures: new Set(line.flatMap((token) => (token.type === "figure" ? [token.value] : []))),
    limits: limitsOf(line),
  };
}

/** A word of the line in any tense or number, a standard shortening of one, or an abbreviation of its words. */
function backedBy(token: Extract<Token, { type: "word" }>, source: Prepared, denied: boolean): boolean {
  const stems = denied ? source.allStems : source.stems;
  if (stems.has(token.stem)) return true;
  if (ABBREVIATIONS[token.stem]?.every((part) => stems.has(part))) return true;
  return SHORTENINGS[token.word]?.some((start) => source.words.some((word) => word.startsWith(start))) ?? false;
}

/** The written line's parts: a new part starts at punctuation and after a word that starts a clause. */
function parts(line: Token[]): number[][] {
  const found: number[][] = [];
  for (const [index, token] of line.entries()) {
    if (index === 0 || token.after) found.push([]);
    found[found.length - 1].push(index);
  }
  return found;
}

/**
 * True when `target` comes straight after the word at `index` ("delivered on time"), or is part of what that word acts
 * on: the words after it up to a preposition or a new clause ("Managed deliveries, stockroom and a team").
 */
function inScope(line: Token[], index: number, target: Token): boolean {
  const same = (token: Token) =>
    keyOf(token) === keyOf(target) ||
    (target.type === "word" && token.type === "word" &&
      (ABBREVIATIONS[target.stem]?.includes(token.stem) || SHORTENINGS[target.word]?.some((start) => token.word.startsWith(start))));
  const next = line.slice(index + 1).find(isContent);
  if (next && same(next)) return true;
  for (const token of line.slice(index + 1)) {
    if (token.after === "stop") return false;
    if (token.type === "word" && SCOPE_ENDS.has(token.word)) return false;
    if (token.after === "comma" && token.type === "word" && token.word.endsWith("ing")) return false;
    if (same(token)) return true;
  }
  return false;
}

/** Phrases that limit a claim to a place or a group: a preposition, then "my" or a word such as team or region. */
function limitsOf(line: Token[]): { stems: string[]; shown: string }[] {
  const limits: { stems: string[]; shown: string }[] = [];
  for (const [index, token] of line.entries()) {
    if (!isWord(token) || !LIMIT_PREPOSITIONS.has(token.word)) continue;
    let personal = false;
    for (let at = index + 1; at < Math.min(line.length, index + 7); at++) {
      const other = line[at];
      if (other.after && at > index + 1) break;
      if (isWord(other, "my") || isWord(other, "our")) personal = true;
      else if (other.type === "word" && !GLUE.has(other.word) && (personal || LIMIT_NOUNS.has(other.stem))) {
        const phrase = line.slice(index, at + 1);
        const stems = phrase.slice(1).flatMap((item) => (item.type === "word" && !GLUE.has(item.word) && item.word !== "my" && item.word !== "our" ? [item.stem] : []));
        limits.push({ stems, shown: phrase.map((item) => item.shown).join(" ") });
        break;
      }
    }
  }
  return limits;
}

/** The nearest preposition before a word in its phrase, or null when the phrase starts with a verb or a new part. */
function prepositionBefore(line: Token[], index: number): string | null {
  for (let at = index - 1; at >= Math.max(0, index - 5); at--) {
    const token = line[at];
    if (token.type === "word" && PREPOSITIONS.has(token.word)) return token.word;
    if ((isContent(token) && token.clause) || token.after) return null;
  }
  return null;
}

/** The key of the first word or figure after a token that isn't a linking word, or "$" at the end. */
function keyAfter(line: Token[], index: number): string {
  const next = line.slice(index + 1).find(isContent);
  return next ? keyOf(next) : "$";
}

/** "as Head of Year 9": the role's own title, or one part of it, may describe the person. Those tokens need no other evidence. */
function titleSpan(line: Token[], title: string | undefined): Set<number> {
  const span = new Set<number>();
  const titles = (title ?? "").split(/\s+and\s+|[,&/]/i).map(tokens).filter((part) => part.length > 0);
  for (const [index, token] of line.entries()) {
    if (!isWord(token, "as")) continue;
    let at = index + 1;
    for (let next = line[at]; isWord(next) && ARTICLES.has(next.word); next = line[at]) at++;
    const named = titles.find((part) => part.every((word, offset) => line[at + offset] && keyOf(line[at + offset]) === keyOf(word)));
    if (named) for (let offset = 0; offset < named.length; offset++) span.add(at + offset);
  }
  return span;
}

type FigureInfo = {
  value: string;
  kind: "money" | "percent" | "count";
  year: boolean;
  /** What it counts: the last word of the phrase after it ("six agency clients" → client). */
  head: string;
  /** "classes of 30" → class. */
  owner: string;
  /** "Year 9" → year, when nothing follows it. */
  label: string;
  /** "over", "nearly", "by", "+"… */
  modifier: string;
  /** For money: "a year", "per student". */
  period: string;
};

function figureInfo(line: Token[], index: number): FigureInfo {
  const token = line[index] as Extract<Token, { type: "figure" }>;
  const [before, beforeThat] = [line[index - 1], line[index - 2]];
  const kind = token.money ? "money" : token.percent ? "percent" : "count";

  let head = "";
  for (const next of line.slice(index + 1)) {
    if (next.after || next.type !== "word" || GLUE.has(next.word)) break;
    head = next.stem;
  }
  const owner = isWord(before, "of") && beforeThat && isContent(beforeThat) ? keyOf(beforeThat) : "";
  const label = !head && !owner && before && isContent(before) && !token.after ? keyOf(before) : "";
  const modifier = token.plus
    ? "+"
    : isWord(before) && MODIFIERS.has(before.word)
      ? before.word
      : isWord(before, "to") && isWord(beforeThat, "up")
        ? "up to"
        : "";

  let period = "";
  if (kind === "money") {
    let at = index + 1;
    for (let next = line[at]; isWord(next) && /^(a|an|per|each|every)$/.test(next.word); next = line[at]) at++;
    const next = line[at];
    if (next?.type === "word" && PERIODS[next.stem]) period = PERIODS[next.stem];
    else if (at > index + 1 && next?.type === "word") period = next.stem;
  }
  const year = kind === "count" && !token.plus && !token.comma && !head && /^(19|20)\d\d$/.test(token.value);
  return { value: token.value, kind, year, head, owner, label, modifier, period };
}

/** A written figure counts the same thing as one in the evidence. "In" clauses about it go one way only: leaving out "of" is fine. */
function sameFigure(written: FigureInfo, evidence: FigureInfo): boolean {
  if (written.value !== evidence.value || written.kind !== evidence.kind || written.modifier !== evidence.modifier) return false;
  if (written.year !== evidence.year) return false;
  if (written.owner && written.owner !== evidence.owner) return false;
  if (written.kind === "money") return !written.period || written.period === evidence.period;
  if (written.kind !== "count" || written.year) return true;
  if (written.head) return written.head === evidence.head;
  if (written.owner) return true;
  if (written.label) return written.label === evidence.label;
  return !evidence.head && !evidence.owner;
}

type Token = (
  | { type: "word"; word: string; stem: string }
  | { type: "figure"; value: string; money: boolean; percent: boolean; plus: boolean; comma: boolean }
) & {
  shown: string;
  /** The break just before it: the start, a full stop (or ; : ! ? or a new line), a comma or bracket, or a word such as "and". */
  after: "start" | "stop" | "comma" | "link" | null;
  /** The word before it when `after` is "link": "and", "by", "i"… */
  link: string | null;
  /** Only linking words stand between it and the last break: it can start a clause. */
  clause: boolean;
  /** It can start a part of its own: at the start of the text, after a full stop, or after "I" or "we". */
  fresh: boolean;
  /** It says "not", "never", "no" or "without". */
  negation: boolean;
  /** It is said not to have happened: it follows a negation in the same clause. */
  negated: boolean;
};

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

/**
 * The text's words and figures, each with what stands before it. Words are compared in UK spelling, as the brand
 * writes them, so "Analysed" is backed by a CV that says "Analyzed".
 */
function tokens(text: string): Token[] {
  const found: Token[] = [];
  const clean = cleanModelText(text).text;
  let end = 0;
  let glueOnly = true;
  let runFresh = true;
  let negating = false;
  for (const match of clean.matchAll(TOKEN)) {
    const [shown, money, digits, scale, plus, percent] = match;
    const gap = clean.slice(end, match.index);
    const previous = found.at(-1);
    const link = previous?.type === "word" && CLAUSE_LINKS.has(previous.word) ? previous.word : null;
    const after: Token["after"] = !previous ? "start" : /[.!?;:\n]/.test(gap) ? "stop" : /[,()–—]/.test(gap) ? "comma" : link ? "link" : null;
    end = match.index + shown.length;
    if (after) {
      glueOnly = true;
      runFresh = after === "start" || after === "stop" || link === "i" || link === "we";
    }
    if (after === "stop" || after === "comma") negating = false;

    const base = { shown, after, link: after === "link" ? link : null, clause: glueOnly, fresh: glueOnly && runFresh, negated: negating };
    let token: Token;
    if (digits !== undefined) {
      const plain = digits.replace(/,(?=\d{3}(?!\d))/g, "");
      const amount = Number(plain) * (scale ? SCALES[scale.toLowerCase()] : 1);
      // "3,4" or "16.8.0" isn't one number: keep the digits as written.
      const value = Number.isNaN(amount) ? plain : String(Math.round(amount * 1000) / 1000);
      token = { ...base, type: "figure", value, money: Boolean(money), percent: Boolean(percent), plus: Boolean(plus), comma: plain !== digits, negation: false };
    } else {
      // "KPIs" is the plural of "KPI"; the stem can't tell, as it keeps "analysis" whole.
      const word = (/^\p{Lu}{2,}s$/u.test(shown) ? shown.slice(0, -1) : shown).toLowerCase().replace(/['’]s$/, "");
      const number = NUMBER_WORDS[word];
      const negation = NEGATIONS.has(word) || /n['’]t$/.test(word);
      token = number
        ? { ...base, type: "figure", value: number, money: false, percent: false, plus: false, comma: false, negation: false }
        : { ...base, type: "word", word, stem: stem(ukSpelling(word)), negation };
      if (negation) negating = true;
      if (word === "but" || word === "i" || word === "we") negating = false;
    }
    if (isContent(token)) glueOnly = false;
    found.push(token);
  }
  return found;
}

/** The brand's UK spelling of a word, so both sides compare the same: "analyzed" → "analysed", "color" → "colour". */
function ukSpelling(word: string): string {
  const uk = findBrandProblems(word).find((problem) => problem.kind === "us-spelling");
  return uk ? uk.suggestion.toLowerCase() : word;
}

/** Words after which a new clause starts: "Cleaned and joined", "…by automating", "I walked". Not "to": "helped to manage". */
const CLAUSE_LINKS = new Set(["and", "or", "then", "while", "by", "also", "but", "i", "we"]);

const NEGATIONS = new Set(["not", "never", "no", "without", "nor", "cannot"]);

/** Words that only link others; they claim nothing, so a line may add them. */
const GLUE = new Set(
  (
    "a an the and or but nor of to in on at for by with from into onto as via per its it their them they this that " +
    "these those which who whose while when where across through throughout within during after before between " +
    "including using also so such then up out alongside i we"
  ).split(" "),
);

const ARTICLES = new Set(["a", "an", "the"]);

/** Prepositions that say whose a rank is: "with two senior developers", "to the area manager", "as manager". */
const PREPOSITIONS = new Set("to for from with as by at in on under over alongside beside without within across".split(" "));

/** Where what a verb acts on ends: "Coordinated the move | to a new timetable". "of" doesn't end it. */
const SCOPE_ENDS = new Set(
  "to for from with in on at into onto through across during via per by under over after before within using alongside while when where".split(" "),
);

/** Words that change what a figure says: "over 120 stores" is not "120 stores". */
const MODIFIERS = new Set(
  "over under than nearly almost about around approximately roughly circa more less fewer least most above below exceeding by".split(" "),
);

/** Prepositions and nouns that limit a claim: "in my team", "for the Midlands region". */
const LIMIT_PREPOSITIONS = new Set(["in", "for", "across", "within", "at"]);

/** Past forms that don't end in -ed, so a change of tense keeps the same word. Above the sets that stem their words. */
const IRREGULAR: Record<string, string> = {
  led: "lead", ran: "run", built: "build", taught: "teach", wrote: "write", written: "write", kept: "keep",
  sold: "sell", made: "make", held: "hold", won: "win", grew: "grow", grown: "grow", bought: "buy", brought: "bring",
  began: "begin", begun: "begin", gave: "give", given: "give", took: "take", taken: "take", met: "meet", sent: "send",
  spent: "spend", told: "tell", thought: "think", found: "find", rose: "rise", risen: "rise", did: "do", done: "do",
  went: "go", gone: "go", saw: "see", seen: "see", chose: "choose", chosen: "choose", drove: "drive", driven: "drive",
  spoke: "speak", spoken: "speak", understood: "understand", stood: "stand", paid: "pay", said: "say", heard: "hear",
  felt: "feel", lost: "lose", caught: "catch", dealt: "deal", meant: "mean", learnt: "learn", used: "use", using: "use",
  oversaw: "oversee", overseen: "oversee", undertook: "undertake", undertaken: "undertake", drew: "draw", drawn: "draw",
};

/** Prefixes kept on an irregular verb: "rebuilt" is "rebuild", not "build". */
const VERB_PREFIXES = ["re", "over", "under", "with", "up"];

const LIMIT_NOUNS = new Set(["team", "class", "region", "area", "department", "branch", "site"].map(stem));

const PERIODS: Record<string, string> = Object.fromEntries(
  [
    ["year", "year"], ["annum", "year"], ["annual", "year"], ["yearly", "year"], ["month", "month"], ["monthly", "month"],
    ["week", "week"], ["weekly", "week"], ["day", "day"], ["daily", "day"], ["hour", "hour"],
  ].map(([word, period]) => [stem(word), period]),
);

/** Ranks and titles: a line may only use them as its evidence does. */
const RANKS = new Set(
  "senior lead leader head chief principal manager director supervisor owner founder executive president".split(" ").map(stem),
);

/** Standard abbreviations, with the words they stand for: "P&L" for "profit and loss". */
const ABBREVIATIONS: Record<string, string[]> = {
  "p&l": ["profit", "loss"].map(stem),
  kpi: ["key", "performance", "indicator"].map(stem),
};

/** Standard shortenings and the starts of the words they stand for: "prep" for "preparation". */
const SHORTENINGS: Record<string, string[]> = {
  prep: ["prepar"],
  admin: ["administ"],
  info: ["inform"],
  stats: ["statistic"],
  comms: ["communicat"],
  dept: ["department"],
};

function keyOf(token: Token | undefined): string {
  if (!token) return "^";
  return token.type === "word" ? token.stem : token.value;
}

function isContent(token: Token): boolean {
  return token.type === "figure" || !GLUE.has(token.word);
}

/** A word token; with `word`, that very word (no narrowing then, as a different word is still a word). */
function isWord(token: Token | undefined): token is Extract<Token, { type: "word" }>;
function isWord(token: Token | undefined, word: string): boolean;
function isWord(token: Token | undefined, word?: string): boolean {
  return token?.type === "word" && (word === undefined || token.word === word);
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

/** A rough stem, so tense and number don't count as new words: "Managed", "managing" and "manages" give "manag". */
function stem(word: string): string {
  const prefix = VERB_PREFIXES.find((start) => word.startsWith(start) && IRREGULAR[word.slice(start.length)]);
  let result = IRREGULAR[word] ?? (prefix ? prefix + IRREGULAR[word.slice(prefix.length)] : word);
  // Names such as "P&L", "Node.js" and "C#" are kept whole.
  if (!/^[a-z]+$/.test(result)) return result;
  if (result.length > 4 && result.endsWith("ies")) result = `${result.slice(0, -3)}y`;
  else if (result.length > 4 && /(ss|x|z|ch|sh)es$/.test(result)) result = result.slice(0, -2);
  else if (result.length > 3 && result.endsWith("s") && !/(ss|us|is)$/.test(result)) result = result.slice(0, -1);
  if (result.length > 4 && result.endsWith("ied")) result = `${result.slice(0, -3)}y`;
  else if (result.length > 5 && result.endsWith("ing")) result = result.slice(0, -3);
  else if (result.length > 4 && result.endsWith("ed")) result = result.slice(0, -2);
  if (/([b-df-hj-np-tv-z])\1$/.test(result)) result = result.slice(0, -1);
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

/** A skill the model named, by its line id or, failing that, by its exact words. */
function skillLine(value: string, shared: EvidenceLine[]): EvidenceLine | undefined {
  const skills = shared.filter((line) => line.kind === "skill");
  const id = normaliseId(value);
  return skills.find((line) => line.id === id) ?? skills.find((line) => sameWords(line.text, value));
}

/** Skill words too general to show a skill alone: "Team leadership" needs more than a line with "team" in it. */
const GENERAL_SKILL_WORDS = new Set(["team", "data", "customer", "project", "time", "people", "client", "business"].map(stem));
const MANAGING = new Set(["lead", "manage", "supervise", "run", "coach"].map(stem));

/**
 * True when the role's duties and results show the skill: they name the first word of one of its alternatives, or the
 * words it stands for ("P&L management" is shown by "profit and loss"). For a general first word they must name the
 * next one too, or, for leading a team, show the person leading, managing or supervising one.
 */
function shows(lines: string[], skill: string): boolean {
  const read = lines.map(tokens);
  const stems = stemSet(read.flat());
  const has = (word: string) => stems.has(word) || (ABBREVIATIONS[word]?.every((part) => stems.has(part)) ?? false);
  return skill.split(/\s+or\s+|[/,;()]/i).some((option) => {
    const [head, next] = keywords(option).map((word) => stem(ukSpelling(word.toLowerCase())));
    if (!head || !has(head)) return false;
    if (!GENERAL_SKILL_WORDS.has(head) || !next) return true;
    if (has(next) || [...stems].some((word) => word.length >= 4 && word.startsWith(next.slice(0, 4)))) return true;
    return /^(lead|manag)/.test(next) && read.some((line) => line.some((token) => token.type === "word" && token.stem === head) && line.some((token) => token.type === "word" && token.clause && MANAGING.has(token.stem)));
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

// The mock answer: each role's own lines that show what the ad asks for, word for word, so the demo works without
// the model and is honest by construction.

/**
 * For each role, its duties and results that show the most requirements the profile meets or touches on (all the
 * words of one of a requirement's alternatives), the match's own evidence first, then results before duties.
 */
export function suggestByRules(profile: Profile, job: Job, match: MatchResult | null): LinkedInAnswer {
  const { roles, shared } = linkedInRoles(profile);
  const findings = currentFindings(profile, job, match);
  const wanted = jobRequirements(job)
    .filter((requirement) => findings.get(requirement.text) !== "missing")
    .map((requirement) => requirement.text.split(/\s+or\s+|[/,;()]/i).map(keywords).filter((words) => words.length > 0));
  const relevance = (text: string) => wanted.filter((options) => options.some((words) => words.every((word) => mentions(text, word)))).length;
  const evidence = new Set((match?.strengths ?? []).map((strength) => strength.evidence));
  const skillLines = shared.filter((line) => line.kind === "skill");

  return {
    roles: roles.flatMap((role) => {
      const lines = role.lines
        .filter((line) => line.text.length <= MAX_LINE_CHARACTERS)
        .map((line, index) => ({ line, index, score: relevance(line.text) + (evidence.has(line.text) ? 1 : 0) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || resultsFirst(a.line) - resultsFirst(b.line) || a.index - b.index)
        .slice(0, MAX_LINES_PER_ROLE);
      if (lines.length === 0) return [];

      const own = role.lines.map((line) => line.text);
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
