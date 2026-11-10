// The Nothing invented check: a change survives only if its evidence can be traced
// word for word to the CV or to the user's own answers.
// Pure code with no model call, so unit tests and the live evals share it.
import { cleanModelText } from "@/shared/clean-text";
import type { Gap, JobRole, Profile } from "@/shared/contracts";
import { isBigSix } from "./big-six";
import type { GapAnswer, ProposedChange, RejectedChange } from "./types";

export type EvidenceSources = {
  profile: Profile;
  gaps: Gap[];
  answers: GapAnswer[];
  /** What the ad says about the role (#398). Its registration and its Band or grade are claims only the user can make. */
  role?: JobRole;
};

/**
 * Without the hidden characters cleanModelText removes before the model reads the text (#68), so a faithful quote
 * still matches. Lower case, straight quotes, single spaces, no trailing full stop.
 */
export function normalise(text: string): string {
  return cleanModelText(text)
    .text.toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,]+$/, "");
}

/** Every line on the CV, as the user wrote it. */
export function cvLines(profile: Profile): string[] {
  return [
    profile.summary,
    ...profile.skills,
    ...profile.experience.flatMap((job) => [job.title, ...job.duties, ...job.achievements]),
    ...profile.education.flatMap((item) => [item.qualification, item.subject ?? "", item.grade ?? ""]),
    ...profile.certifications.map((item) => item.name),
    ...(profile.languages ?? []).flatMap((item) => [item.name, item.level ?? ""]),
    ...(profile.projects ?? []).flatMap((item) => [item.name, item.organisation ?? "", ...item.details]),
  ].filter((line) => line.trim() !== "");
}

function answerLines({ profile, answers }: EvidenceSources): string[] {
  return [...profile.followUpAnswers.map((item) => item.answer), ...answers.map((item) => item.answer)];
}

/** The words of a requirement worth looking for, e.g. "Asana or Jira" gives "asana" and "jira". */
export function requirementTerms(requirement: string): string[] {
  return requirement
    .split(/\s+or\s+|,|\//i)
    .map(normalise)
    .filter((term) => term.length >= 2);
}

/** Evidence counts when it is a whole source line, or a quote of at least three words from one. */
function isQuotedFrom(evidence: string, lines: string[]): boolean {
  const quote = normalise(evidence);
  if (quote === "") return false;
  const longEnough = quote.split(" ").length >= 3;
  return lines.some((line) => {
    const source = normalise(line);
    return source === quote || (longEnough && source.includes(quote));
  });
}

/** True when the skill appears as whole words, so "R" is not found in "stores" but "C++" is found in "C++ code". */
function namedIn(skill: string, evidence: string): boolean {
  const name = normalise(skill).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${name}(?![a-z0-9])`).test(normalise(evidence));
}

/** Registration bodies by their short name; a full name or "RGN" in any text is read as the short name (#432). */
const bodies: { short: string; display: string; names: RegExp }[] = [
  { short: "nmc", display: "NMC", names: /\b(nursing and midwifery council|rgn)\b/g },
  { short: "gmc", display: "GMC", names: /\bgeneral medical council\b/g },
  { short: "hcpc", display: "HCPC", names: /\bhealth and care professions council\b/g },
  { short: "gphc", display: "GPhC", names: /\bgeneral pharmaceutical council\b/g },
  { short: "gdc", display: "GDC", names: /\bgeneral dental council\b/g },
];
const numberWords: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };

/**
 * One spelling for a Band, a grade and a registration body on both sides of the check: "Band-6", "Band6" and
 * "Band six" are "band 6", and "Nursing and Midwifery Council" and "RGN" are "nmc". `withWardCodes` also reads "B6" as
 * "band 6", only for the suggestion and the line it rewrites: in a job title "Ward B6" is the name of a ward.
 */
function oneSpelling(text: string, withWardCodes = false): string {
  let result = normalise(text)
    .replace(/\b(band|grade)[\s-]*(one|two|three|four|five|six|seven|eight|nine)\b/g, (_, kind: string, word: string) => `${kind} ${numberWords[word]}`)
    .replace(/\b(band|grade)[\s-]*(\d+[a-d]?)\b/g, "$1 $2");
  if (withWardCodes) result = result.replace(/\bb(\d+[a-d]?)\b/g, "band $1");
  for (const body of bodies) result = result.replace(body.names, body.short);
  return result;
}

type RoleTerm = { term: string; display: string; kind: "level" | "registration" };

/** The claims the role makes: each listed body in `registration` (or the whole of it), and each Band or grade number in `level`. */
function roleTerms(role: JobRole): RoleTerm[] {
  const registration = oneSpelling(role.registration);
  const named = bodies.filter((body) => new RegExp(`\\b${body.short}\\b`).test(registration));
  const registrations: RoleTerm[] = named.length
    ? named.map((body) => ({ term: body.short, display: body.display, kind: "registration" }))
    : registration.length >= 2
      ? [{ term: registration, display: role.registration.trim(), kind: "registration" }]
      : [];
  // "Band 5/6" claims Band 5 and Band 6; "Band 8a" stays Band 8a.
  const levels = [...oneSpelling(role.level).matchAll(/\b(band|grade) (\d+[a-d]?(?:\s*\/\s*\d+[a-d]?)*)/g)].flatMap(([, kind, numbers]) =>
    numbers.split("/").map((number): RoleTerm => {
      const term = `${kind} ${number.trim()}`;
      return { term, display: term[0].toUpperCase() + term.slice(1), kind: "level" };
    }),
  );
  return [...registrations, ...levels];
}

const escaped = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => new RegExp(`(?<![a-z0-9])${escaped(term)}(?![a-z0-9])`).test(text);

/** Words that say the job or the registration is wanted, not held. */
const wanting = "looking for|seeking|applying for|apply for|ready for|step up to|stepping up to|working towards|due to join|awaiting";

/**
 * Without the places that name the term as something wanted: "looking for a Band 6 role", "ready for the Senior
 * Staff Nurse (Band 6) post", "due to join the NMC register". "Acted up into a Band 6 role" is a claim and stays.
 */
function withoutJobsWanted(text: string, term: string): string {
  const wanted = new RegExp(
    `\\b(?:${wanting})\\s+(?:(?:a|an|the)\\s+)?(?:[a-z0-9-]+\\s+){0,3}\\(?${escaped(term)}\\)?\\s+(?:role|post|position|job|vacancy|register|registration|pin)\\b`,
    "g",
  );
  return text.replace(wanted, " ");
}

/**
 * The ad's registration (e.g. "NMC") or numbered Band or grade (e.g. "Band 6") that the change claims and nothing the
 * user gave about themselves supports (#422, #432). Both sides are read in one spelling, and a term named only as
 * something wanted never counts, on either side.
 * - Support for a Band or grade: their job titles. For a registration: their job titles, skills and certificates,
 *   name and issuer. The summary does not count ("Looking for a Band 6 role" is a wish), nor do duties, where
 *   "Support the Band 6 nurse in charge" is about someone else.
 * - For both: the line the change rewrites, their follow-up answers, and each yes answer with its gap's requirement,
 *   so a typed "Yes" to the NMC gap counts. For a registration that requirement must be about registering, so a yes
 *   to "Knowledge of the NMC Code" does not.
 */
export function roleClaimAdded(change: ProposedChange, sources: EvidenceSources): string | null {
  if (!sources.role) return null;
  const { profile, gaps, answers } = sources;
  const titles = profile.experience.map((job) => job.title);
  const ownLines = {
    level: titles,
    registration: [...titles, ...profile.skills, ...profile.certifications.flatMap((item) => [item.name, item.issuer ?? ""])],
  };
  const yes = answers.filter((answer) => answer.hasExperience);
  const requirementsSaidYesTo = yes.flatMap((answer) => gaps.find((gap) => gap.id === answer.gapId)?.requirement ?? []);
  const shared = [...profile.followUpAnswers.map((item) => item.answer), ...yes.map((answer) => answer.answer)];
  const before = oneSpelling(change.before ?? "", true);
  const after = oneSpelling(change.after, true);

  const claim = roleTerms(sources.role).find(({ term, kind }) => {
    if (!has(withoutJobsWanted(after, term), term)) return false;
    const requirements = kind === "registration" ? requirementsSaidYesTo.filter((line) => /\bregist(er|ered|ration)\b/i.test(line)) : requirementsSaidYesTo;
    const supported = [before, ...[...ownLines[kind], ...shared, ...requirements].map((line) => oneSpelling(line))];
    return !supported.some((line) => has(withoutJobsWanted(line, term), term));
  });
  return claim?.display ?? null;
}

/** Why a change breaks Nothing invented, or null when it is supported. */
export function unsupportedReason(change: ProposedChange, sources: EvidenceSources): string | null {
  const lines = change.evidenceSource === "cv" ? cvLines(sources.profile) : answerLines(sources);
  if (!isQuotedFrom(change.evidence, lines)) {
    return `The evidence is not a quote from the user's ${change.evidenceSource === "cv" ? "CV" : "answers"}.`;
  }

  // A main skill such as Communication is shown by a line, not named in it; a tool must be named.
  if (change.section === "skills" && isBigSix(change.after)) {
    if (sources.profile.skills.some((skill) => normalise(skill) === normalise(change.evidence))) {
      return "A main skill needs a line that shows it, not an entry in the skills list.";
    }
  } else if (change.section === "skills" && !namedIn(change.after, change.evidence)) {
    return "The new skill is not named in the evidence.";
  }

  const noExperience = sources.answers.filter((answer) => !answer.hasExperience);
  if (change.gapId && noExperience.some((answer) => answer.gapId === change.gapId)) {
    return "The user said they have no experience for this gap.";
  }

  const after = normalise(change.after);
  const before = normalise(change.before ?? "");
  for (const answer of noExperience) {
    const gap = sources.gaps.find((item) => item.id === answer.gapId);
    const added = gap && requirementTerms(gap.requirement).find((term) => after.includes(term) && !before.includes(term));
    if (added) {
      return `It adds "${added}", which the user said they have not done.`;
    }
  }

  const claim = roleClaimAdded(change, sources);
  if (claim) {
    return `It adds "${claim}", which only the job ad says.`;
  }

  return null;
}

/** Splits changes into the ones with traceable evidence and the ones removed. */
export function enforceNothingInvented(
  changes: ProposedChange[],
  sources: EvidenceSources,
): { kept: ProposedChange[]; removed: RejectedChange[] } {
  const kept: ProposedChange[] = [];
  const removed: RejectedChange[] = [];
  for (const change of changes) {
    const reason = unsupportedReason(change, sources);
    if (reason) {
      removed.push({ change, reason });
    } else {
      kept.push(change);
    }
  }
  return { kept, removed };
}
