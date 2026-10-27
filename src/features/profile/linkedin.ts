import { z } from "zod";
import { cleanModelText } from "@/shared/clean-text";
import type { Job, MatchResult, Profile, WorkExperience } from "@/shared/contracts";
import {
  assessByRules,
  jobRequirements,
  keywords,
  mentions,
  normaliseId,
  profileEvidenceLines,
  type EvidenceLine,
  type Importance,
} from "./match";
import { formatPeriod } from "./ui/format";

// LinkedIn Experience lines: what to add under each role of the user's LinkedIn profile, for one job.
// The model (or, in mock mode, simple rules) only chooses: for each role, which of its own duties and results show
// what the ad asks for, by their ids as in match.ts. The code shows those lines exactly as the CV says them, so a
// line can't claim anything the CV doesn't (Nothing invented, Sounds like you). Titles, companies and dates come from
// the CV too. Nothing is saved and nothing is sent to LinkedIn: the user copies what they want.

/** At most this many lines for one role: a short description gets read. */
export const MAX_LINES_PER_ROLE = 5;
/** At most this many skills for one role. */
export const MAX_SKILLS_PER_ROLE = 5;
/** LinkedIn's limit for a position's description, so the lines for one role can be pasted in one go. */
export const LINKEDIN_DESCRIPTION_CHARACTERS = 2000;

/** The model's answer (see prompts/profile-linkedin-experience.md). */
export const LinkedInAnswerSchema = z.object({
  roles: z.array(
    z.object({
      /** The role's id, e.g. "R1". */
      role: z.string(),
      /** The ids of the role's own duties and results to add, most useful first, e.g. ["L11"]. */
      lines: z.array(z.string()),
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

/**
 * The profile's lines by role, with the same ids as match.ts. Everything else (summary, skills, education,
 * certificates and answers) belongs to no role: none of it is a line of the CV under a role.
 */
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

/**
 * Why a profile has nothing to take LinkedIn lines from, or null when it has: no roles at all, or roles with no
 * duties or results, so a model request would be wasted.
 */
export function nothingToWrite(profile: Profile): "no-roles" | "no-lines" | null {
  if (profile.experience.length === 0) return "no-roles";
  return linkedInRoles(profile).roles.every((role) => role.lines.length === 0) ? "no-lines" : null;
}

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
  /** Lines of the CV under this role, word for word. */
  lines: string[];
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
  /** How many of the model's choices were left out because they aren't the role's own lines or skills. */
  dropped: number;
};

/** A choice that was left out, and why: for the tests and the prompt evals. */
export type RejectedSuggestion = { role: string; text: string; reason: string };

/**
 * Turns the model's answer into what the user sees: for each role, the duties and results it chose, as the CV says
 * them, and the skills those lines show. Any id that isn't one of the role's own lines or a skill they show is left
 * out and listed in `rejected`. Roles with nothing left go to `otherRoles`. The ad's requirements the profile doesn't
 * show clearly go to `notShown`, so the user knows why no line mentions them.
 */
export function buildLinkedInSuggestions(
  profile: Profile,
  job: Job,
  match: MatchResult | null,
  answer: LinkedInAnswer,
): { suggestions: LinkedInSuggestions; rejected: RejectedSuggestion[] } {
  const { roles, shared } = linkedInRoles(profile);
  const owners = new Map(roles.flatMap((role) => [role.role, ...role.lines].map((line) => [line.id, role.id] as const)));
  const known = new Set([...roles.flatMap((role) => [role.role, ...role.lines]), ...shared].map((line) => line.id));
  const findings = currentFindings(profile, job, match);
  const rejected: RejectedSuggestion[] = [];

  const answers = new Map<string, RoleAnswer>();
  for (const item of answer.roles) {
    const id = normaliseId(item.role);
    // A second answer for the same role is ignored: the first one already says what to add.
    if (answers.has(id)) continue;
    if (roles.some((role) => role.id === id)) {
      answers.set(id, item);
      continue;
    }
    for (const text of [...item.lines, ...item.skills]) {
      if (text.trim()) rejected.push({ role: id, text, reason: `There is no role ${id} on the profile.` });
    }
  }

  const suggested: LinkedInRole[] = [];
  const otherRoles: string[] = [];
  for (const [index, role] of roles.entries()) {
    const item = answers.get(role.id);

    const lines: string[] = [];
    for (const value of item?.lines ?? []) {
      if (!value.trim()) continue;
      const id = normaliseId(value);
      const line = role.lines.find((own) => own.id === id);
      if (!line) {
        const owner = owners.get(id);
        const reason = !known.has(id)
          ? `${id} is not a line of the profile.`
          : owner && owner !== role.id
            ? `${id} belongs to another role.`
            : `${id} is not a duty or result of this role.`;
        rejected.push({ role: role.id, text: value, reason });
        continue;
      }
      const text = tidy(line.text);
      if (text && !lines.some((other) => sameWords(other, text))) lines.push(text);
    }

    const own = role.lines.map((line) => line.text);
    const skills: string[] = [];
    for (const value of item?.skills ?? []) {
      const skill = skillLine(value, shared);
      if (!skill) rejected.push({ role: role.id, text: value, reason: "It is not a skill on the profile." });
      else if (!shows(own, skill.text)) rejected.push({ role: role.id, text: skill.text, reason: "The role's own lines don't show this skill." });
      else if (!skills.includes(skill.text)) skills.push(skill.text);
    }

    const kept = fitDescription(lines.slice(0, MAX_LINES_PER_ROLE));
    if (kept.length === 0 && skills.length === 0) {
      otherRoles.push(role.role.text);
      continue;
    }
    suggested.push({ ...roleDetails(role, roles.slice(0, index)), lines: kept, skills: skills.slice(0, MAX_SKILLS_PER_ROLE) });
  }

  const notShown = jobRequirements(job).flatMap(({ text, importance }) => {
    const kind = findings.get(text);
    return kind === "missing" || kind === "unclear" ? [{ requirement: text, importance, kind }] : [];
  });
  return { suggestions: { roles: suggested, otherRoles, notShown, dropped: rejected.length }, rejected };
}

/** The lines, best first, that fit in one LinkedIn description as the page copies them ("• line", one a line). */
function fitDescription(lines: string[]): string[] {
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const added = (kept.length > 0 ? 1 : 0) + 2 + line.length;
    if (length + added > LINKEDIN_DESCRIPTION_CHARACTERS) break;
    kept.push(line);
    length += added;
  }
  return kept;
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

/** A skill the model named, by its line id or, failing that, by its exact words. */
function skillLine(value: string, shared: EvidenceLine[]): EvidenceLine | undefined {
  const skills = shared.filter((line) => line.kind === "skill");
  const id = normaliseId(value);
  return skills.find((line) => line.id === id) ?? skills.find((line) => sameWords(line.text, value));
}

/** Skill words too general to show a skill alone: "Team leadership" needs more than a line with "team" in it. */
const GENERAL_SKILL_WORDS = new Set(["team", "data", "customer", "project", "time", "people", "client", "business"]);

/** A line where the person leads, manages, runs or supervises something: "Managed deliveries, stockroom and a team". */
const MANAGING = /(^|[^\p{L}])(led|lead(s|ing)?|manag\p{L}*|supervis\p{L}*|ran|run(s|ning)?|coach\p{L}*|head(s|ed|ing)?)($|[^\p{L}])/iu;

/** Standard abbreviations, with the words they stand for: "P&L" for "profit and loss". */
const ABBREVIATIONS: Record<string, string[]> = {
  "p&l": ["profit", "loss"],
  kpi: ["key", "performance", "indicator"],
};

/**
 * True when the role's duties and results show the skill: they name the first word of one of its alternatives, or the
 * words it stands for ("P&L management" is shown by "profit and loss"). For a general first word they must name the
 * next one too, or, for leading or managing a team, show the person leading, managing or supervising one.
 */
function shows(lines: string[], skill: string): boolean {
  const named = (word: string) =>
    word.length <= 2
      ? lines.some((line) => standsAlone(line, word))
      : lines.some((line) => mentions(line, word)) ||
        (ABBREVIATIONS[word.toLowerCase()]?.every((part) => lines.some((line) => mentions(line, part))) ?? false);
  return skill.split(/\s+or\s+|[/,;()]/i).some((option) => {
    const [head, next] = keywords(option);
    if (!head || !named(head)) return false;
    if (!GENERAL_SKILL_WORDS.has(head.toLowerCase()) || !next) return true;
    if (named(next)) return true;
    return /^(lead|manag)/i.test(next) && lines.some((line) => mentions(line, head) && MANAGING.test(line));
  });
}

/** A one- or two-letter name as a word of its own, in the same case: "R" is in "Built R models", not in "R&D"; "C" isn't in "C#". */
function standsAlone(line: string, word: string): boolean {
  return line.split(/[^\p{L}\p{N}+#&.]+/u).some((token) => token.replace(/\.+$/, "") === word);
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

/**
 * Text as it should be copied: no hidden characters, no bullet of its own and one space between words. A dash is a
 * bullet only with a space after it, so "-20% waste" keeps its minus sign.
 */
function tidy(text: string): string {
  return cleanModelText(text)
    .text.replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[•·*]+\s*|[–—-]+\s+)/, "");
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

// The mock answer: each role's own lines that show what the ad asks for, chosen by simple rules instead of the model.

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
      return [{ role: role.id, lines: lines.map(({ line }) => line.id), skills: skills.map((skill) => skill.id) }];
    }),
  };
}

function resultsFirst(line: EvidenceLine): number {
  return line.kind === "achievement" ? 0 : 1;
}
