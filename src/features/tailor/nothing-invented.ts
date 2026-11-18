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
 * "Band six" are "band 6", "&" is "and", and "Nursing and Midwifery Council" and "RGN" are "nmc". `codes` says where
 * "B6" means Band 6: "line" for the suggestion and the line it rewrites, but not after ward, bay or unit, where it names
 * a place (#464); "title" only in brackets, as in "Staff Nurse (B6)"; "none" anywhere else.
 */
function oneSpelling(text: string, codes: "line" | "title" | "none" = "none"): string {
  let result = normalise(text)
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .replace(/\b(band|grade)[\s-]*(one|two|three|four|five|six|seven|eight|nine)\b/g, (_, kind: string, word: string) => `${kind} ${numberWords[word]}`)
    .replace(/\b(band|grade)[\s-]*(\d+[a-d]?)\b/g, "$1 $2");
  if (codes === "line") result = result.replace(/(?<!\b(?:ward|bay|unit) )\bb(\d+[a-d]?)\b/g, "band $1");
  if (codes === "title") result = result.replace(/\(b(\d+[a-d]?)\)/g, "(band $1)");
  for (const body of bodies) result = result.replace(body.names, body.short);
  return result;
}

type RoleTerm = { term: string; display: string; kind: "level" | "registration" };

/**
 * The claims the role makes: each listed body in `registration` (or the whole of it), and each Band or grade number in
 * `level`: "Band 5/6", "Band 5-6", "Bands 5 and 6" and "Band 5 to 6" claim Band 5 and Band 6; "Band 8a" stays Band 8a.
 */
function roleTerms(role: JobRole): RoleTerm[] {
  const registration = oneSpelling(role.registration);
  const named = bodies.filter((body) => new RegExp(`\\b${body.short}\\b`).test(registration));
  const registrations: RoleTerm[] = named.length
    ? named.map((body) => ({ term: body.short, display: body.display, kind: "registration" }))
    : registration.length >= 2
      ? [{ term: registration, display: role.registration.trim(), kind: "registration" }]
      : [];
  const number = String.raw`\d+[a-d]?`;
  const between = String.raw`\s*(?:/|-|–|\bto\b|\bor\b|\band\b)\s*`;
  const levels = [...oneSpelling(role.level).matchAll(new RegExp(`\\b(band|grade)s? (${number}(?:${between}${number})*)`, "g"))].flatMap(([, kind, numbers]) =>
    numbers.split(new RegExp(between)).map((value): RoleTerm => {
      const term = `${kind} ${value.trim()}`;
      return { term, display: term[0].toUpperCase() + term.slice(1), kind: "level" };
    }),
  );
  return [...registrations, ...levels];
}

const escaped = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => new RegExp(`(?<![a-z0-9])${escaped(term)}(?![a-z0-9])`).test(text);

/** Words that say the job or the registration is wanted, not held, before a noun such as role or register. */
const wanting =
  "looking for|seeking|applying for|apply for|applied for|ready for|working towards|due to join|joining|awaiting|waiting for|aim for|aiming for|keen to";
/** Words that say it is wanted even with no noun after it: "ready to step up to Band 6". */
const movingUp = "step up to|stepping up to|progress to|progressing to|move into|moving into";
const wantedNouns = "roles?|posts?|positions?|jobs?|vacanc(?:y|ies)|register|registration|pin";

/**
 * Without the places that name the term as something wanted, not held: "looking for a Band 6 role", "seeking Band 6
 * roles", "keen to progress to a Band 6 role", "ready for the Senior Staff Nurse (Band 6) post", "due to join the NMC
 * register", "working towards registration with the NMC" (#526). For a registration, a clause that says it is
 * pending, awaited or expected, or due next to the registration, is a wish too: "NMC registration pending", "NMC
 * registration due in May". "Acted up into a Band 6 role" is a claim and stays.
 */
function withoutJobsWanted(text: string, { term, kind }: RoleTerm): string {
  const name = `\\(?${escaped(term)}\\)?`;
  const words = String.raw`(?:[a-z0-9-]+\s+){0,3}`;
  const article = String.raw`(?:(?:a|an|the)\s+)?`;
  const wanted = new RegExp(
    `\\b(?:(?:${wanting})\\s+${article}${words}${name}\\s+(?:${wantedNouns})|(?:${movingUp})\\s+${article}${words}${name}(?:\\s+(?:${wantedNouns}))?)\\b`,
    "g",
  );
  const result = text.replace(wanted, " ");
  if (kind !== "registration") return result;
  const withBody = new RegExp(`\\b(?:${wanting})\\s+${article}${words}regist(?:er|ered|ration)\\s+(?:with|by|on)\\s+(?:the\\s+)?${name}`, "g");
  // "Due" only next to the registration (#526): "NMC registration due in May", "My NMC PIN is due", "due to be NMC
  // registered". Not "NMC registered nurse due back from maternity leave" or "NMC PIN (revalidation due March 2027)".
  const it = `(?:${escaped(term)}|regist(?:er|ered|ration))`;
  const dueNear = new RegExp(`(?<![a-z0-9])${it}(?:\\s+(?:application|pin))?(?:\\s+(?:is|was))?\\s+due\\b|\\bdue\\s+(?:[a-z0-9']+\\s+){0,2}${it}(?![a-z0-9])`);
  // "NMC registration pending", "awaiting my NMC PIN, expected in May": the whole clause is about the future.
  return result
    .replace(withBody, " ")
    .split(/(?<=[,;.])/)
    .map((clause) =>
      /\b(pending|awaiting|expected)\b/.test(clause) || dueNear.test(clause) ? clause.replace(new RegExp(`(?<![a-z0-9])${escaped(term)}(?![a-z0-9])`, "g"), " ") : clause,
    )
    .join("");
}

/**
 * Without the places that name the term for someone else: "alongside NMC registered nurses", "support the Band 6 nurse
 * in charge", "tasks from NMC-registered nurses", and after a plural such as nurses or staff, "nurses registered with
 * the NMC", "staff regulated by the HCPC" and "registered nurses (NMC)" (#526). "Registered nurse (NMC)" is their own.
 */
function withoutOthers(text: string, term: string): string {
  const name = `\\(?${escaped(term)}\\)?`;
  const people = "nurses|staff|colleagues|doctors|midwives|practitioners|professionals|clinicians|nurse in charge|sister|charge nurse";
  const plural = "nurses|staff|colleagues|doctors|midwives|practitioners|professionals|clinicians";
  const forOthers = new RegExp(
    // "Registered with the NMC", "regulated by the NMC" and "my PIN from the NMC" are the user's own registration, so
    // with, by or from after them is not about others.
    `\\b(?:alongside|(?<!\\b(?:regist(?:ered|ration)|regulated|pin)\\s)(?:with|by|from)|under|support(?:ed|ing)?|assist(?:ed|ing)?|help(?:ed|ing)?|shadow(?:ed|ing)?)\\s+(?:the\\s+|a\\s+|an\\s+|other\\s+)?${name}|${name}[\\s-]+(?:registered[\\s-]+)?(?:${people})\\b` +
      `|\\b(?:${plural})\\s+(?:(?:who|that)\\s+(?:are|were)\\s+)?(?:registered|regulated)\\s+(?:with|by)\\s+(?:the\\s+)?${name}|\\b(?:${plural})\\s+\\(${escaped(term)}\\)`,
    "g",
  );
  return text.replace(forOthers, " ");
}

/**
 * A clause about a registration the user does not hold now: not yet, pending, lapsed, no longer, pre-registration,
 * students and trainees (#483), and a first-person future or condition (#526): "until I receive my NMC PIN", "once I
 * have my NMC PIN", "I will apply to the NMC", "who will be on the NMC register", "due to receive my NMC PIN". Student
 * and trainee only when no plural noun follows within two words, so "mentors student nurses" stays; plan, hope, aim
 * and intend only with "to", so "care plans" stays; re-registration not when it is done ("re-registration after Return
 * to Practice"). Words that say so only next to the registration, such as no, will and approved, are in nearNotHeld.
 */
const notHeldNow = new RegExp(
  String.raw`\b(?:not|never|yet|no longer|eligible|expect(?:s|ed|ing)?|(?:hop(?:e|es|ing)|plan(?:s|ning)?|aim(?:s|ing)?|intend(?:s|ing)?) to|pending|await(?:s|ed|ing)?|lapsed|expired|leads? to|leading to|(?:on|upon) (?:qualifying|completion)|pre-registration|re-registration(?! (?:after|following|completed|in \d))|registration assessment|(?:student|trainee)(?! (?:[a-z-]+ )?[a-z-]+s\b))\b|n't\b` +
    String.raw`|\b(?:until|once)\s+(?:i|i've|i'm|i am|my|we)\b|\bi(?:'ll|\s+will)\b` +
    String.raw`|\bwill\s+(?:(?:hopefully|soon|then|also)\s+)?(?:be\s+(?:on|added|registered)|join(?:ing)?|apply(?:ing)?|sit(?:ting)?|receive|get|register|qualify)\b` +
    String.raw`|\bdue\s+to\s+(?:receive|sit|finish|complete|join|register|be|get|qualify|take)\b`,
);

/** Words that say a registration is not held now only next to it (#526), up to two words before it ("will be NMC registered")… */
const beforeRegistration = "will|once|until|due|approved|exams?|working towards";
/** …or right after it ("NMC registration in progress", "NMC approved", "NMC registration will come through", "is being processed")… */
const afterRegistration = "will|should|would|once|due|approved|exams?|applied|submitted|processing|processed|in progress|in process";
/** …or right after the body's own name, never after "registered" ("NMC CBT", "NMC OSCE"; not "NMC registered CBT therapist"). */
const afterBody = "test of competence|cbt|osce";
/** Adjectives "no" may take before the registration: "no current UK NMC registration". */
const noAdjectives = "current|active|valid|live|uk|british|full";
/** Words that may sit between a word such as "will" and "register…": "will be registered", "working towards full registration". */
const fillers = "be|been|being|get|getting|have|has|my|the|a|an|on|with|to|join|joining|for|full|fully|formal|formally|uk|current";
/** NMC nouns that are not the registration: "preparing for my NMC revalidation", "applied the NMC Code", "NMC recordable V300". */
const notRegistration = "revalidation|code|standards?|recordable|guidance|approved|council";
const months = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";

/**
 * Where a clause says the registration is not held now with words next to it (#526). The match covers the term where
 * it names it, so blanking it leaves the clause's other "NMC registered":
 * - up to two words before the term, or only fillers before "register…" ("will be NMC registered", "working towards
 *   registration"; not "working towards SCPHN registration"); applying, applied, preparing or submitted (my
 *   application) for, to or towards a registration or the body ("Preparing for NMC registration", "applied to join the
 *   NMC register", "Applied to the NMC in May"; not "preparing for my NMC revalidation"); "in the process of
 *   registering"; then or can before join or register ("then register with the NMC");
 * - "no", perhaps with adjectives, one word before it ("no current UK registration with the NMC", "no PIN from the NMC");
 * - right after it, perhaps after "application", "pin" and up to three of is, was, currently, being ("NMC registration in
 *   progress", "my NMC application is being processed"); a test right after the body's name ("NMC CBT");
 * - "until" up to three words after it, then a year before this one: a registration that has ended ("Registered with
 *   the NMC until 2019"). "PIN active until 2028" and "registered until 2027" are still held.
 * "Register…" takes the body's name next to it: "NMC registration", "registered with the NMC", "PIN from the NMC".
 */
function nearNotHeld(term: string): RegExp {
  const body = escaped(term);
  const register = String.raw`(?:${body}[\s-]+)?(?:re-?)?(?:regist(?:er|ered|ering|ers|ration)|pin)(?:\s+(?:with|by|on|to|from)\s+(?:the\s+)?${body})?`;
  const it = String.raw`(?:${register}|${body})(?![a-z0-9])`;
  const words = (count: number) => String.raw`[\s()/:-]+(?:[a-z0-9']+[\s()/:-]+){0,${count}}`;
  const filled = String.raw`[\s()/:-]+(?:(?:${fillers})[\s()/:-]+){0,3}`;
  const start = "(?<![a-z0-9'])";
  const before = [
    String.raw`${start}no(?:\s+(?:${noAdjectives}))*${words(1)}${it}`,
    String.raw`(?:${start}(?:${beforeRegistration})|'ll)(?:${words(2)}${body}(?![a-z0-9])|${filled}${register}(?![a-z0-9]))`,
    String.raw`${start}(?:applying|applied|preparing|submitted)(?:\s+my\s+application)?\s+(?:for|to|towards)\s+(?:join\s+)?(?:(?:the|my|an?)\s+)?(?:${register}(?![a-z0-9])|${body}(?![a-z0-9])(?![\s-]+(?:${notRegistration})\b))`,
    String.raw`${start}in\s+(?:the\s+)?process\s+of${filled}${register}(?![a-z0-9])`,
    String.raw`${start}(?:then|can|could)\s+(?:join|register)\s+(?:with\s+)?(?:the\s+)?${it}`,
  ];
  const after = String.raw`(?<![a-z0-9])${it}(?:\s+(?:application|pin))?(?:\s+(?:is|was|currently|now|still|being)){0,3}[\s()/:-]+(?:${afterRegistration})(?![a-z0-9])|(?<![a-z0-9])${body}[\s()/:-]+(?:${afterBody})(?![a-z0-9])`;
  const ended = String.raw`(?<![a-z0-9])${it}(?:[\s()/:-]+[a-z0-9']+){0,3}[\s()/:-]+until\s+(?:(?:${months})[a-z]*\s+|\d{1,2}/)?((?:19|20)\d\d)\b`;
  return new RegExp([...before, after, ended].map((part) => `(?:${part})`).join("|"), "g");
}

/** The places a clause still says the user holds the registration: "NMC registered", "registered with the NMC", "(NMC)". */
function heldPhrase(term: string): RegExp {
  const body = escaped(term);
  return new RegExp(String.raw`(${body}[\s-]+regist(?:ered|ration)\b|regist(?:ered|ration)\s+(?:with|by)\s+(?:the\s+)?${body}(?![a-z0-9])|\(${body}\))|(?<![a-z0-9])${body}(?![a-z0-9])`, "g");
}

/**
 * Without the registration term in each clause of a supporting line that says it is not held now (#483): "I'm not NMC
 * registered yet", "eligible for NMC registration in September", "my NMC registration lapsed", "until I receive my NMC
 * PIN" (#526). A clause that says so only next to the term, as nearNotHeld reads it, loses those words, and keeps the
 * term only where it still says they hold it: "passed the NMC CBT and has been NMC registered since 2023" keeps "NMC
 * registered", "Sitting my NMC exams and I know the NMC Code" keeps nothing. Only for a registration, only on the side
 * of the support: at worst a true line stays out.
 */
function heldNow(line: string, { term, kind }: RoleTerm): string {
  if (kind !== "registration") return line;
  return line
    .split(/(?<=[,;.])/)
    .map((clause) => heldInClause(clause, term) ?? clause)
    .join("");
}

/** The clause as heldNow leaves it, or null when nothing in it says the registration is not held now. */
function heldInClause(clause: string, term: string): string | null {
  if (notHeldNow.test(clause)) return clause.replace(new RegExp(`(?<![a-z0-9])${escaped(term)}(?![a-z0-9])`, "g"), " ");
  let found = false;
  // `until` with a year counts only for a year before this one: "until 2019" has ended, "until 2028" has not.
  const rest = clause.replace(nearNotHeld(term), (match: string, year: string | undefined) => {
    if (year !== undefined && Number(year) >= new Date().getFullYear()) return match;
    found = true;
    return " ";
  });
  return found ? rest.replace(heldPhrase(term), (match: string, held?: string) => (held ? match : " ")) : null;
}

/** Whether any clause of a line says the registration is not held now, or is wanted: "Registration pending" (#526). */
const saysNotHeld = (line: string, term: string) =>
  /\b(?:pending|awaiting|expected)\b/.test(line) || line.split(/[,;.]/).some((clause) => heldInClause(clause, term) !== null);

/** A test, never a registration: "NMC Test of Competence (CBT) passed", "OSCE passed", "OET Nursing (Grade B)" (#526). */
const namesTest = /\b(?:test of competence|cbt|osce|oet|ielts)\b/;
/** A skill about the test, not CBT as a therapy: "Passed the CBT for NMC registration", but not "NMC registered CBT practitioner". */
const testSkill = /\b(?:test of competence|osce|oet|ielts)\b|\b(?:passed|sat|sitting|booked)\b[^,;.]*\bcbt\b|\bcbt\b[^,;.]*\b(?:passed|for\s+(?:the\s+)?(?:[a-z]+\s+)?regist)/;

/** A Band the user was given: "Promoted to Band 6 in 2023", "Appointed as a Band 6 sister". Acting up is not one. */
function promotedTo(line: string, term: string): string {
  const match = line.match(new RegExp(`\\b(?:promoted|appointed)\\b[^,;.]*?(?<![a-z0-9])${escaped(term)}(?![a-z0-9])`));
  return match ? match[0] : "";
}

/**
 * The ad's registration (e.g. "NMC") or numbered Band or grade (e.g. "Band 6") that the change claims and nothing the
 * user gave about themselves supports (#422, #432, #464). Both sides are read in one spelling, and a term named only as
 * something wanted never counts, on either side.
 * - Support for a Band or grade: their job titles (with "(B6)"), and a duty or achievement that says they were
 *   promoted or appointed to it. For a registration: their job titles, skills and certificates, name and issuer, and
 *   a summary or degree line that says they are registered (#466). Other duties never count.
 * - For both: the line the change rewrites, unless it names the term for someone else ("alongside NMC registered
 *   nurses"), their follow-up answers, and the words of each yes answer.
 * - For a registration, every supporting line except titles loses each clause that says it is not held now (heldNow,
 *   #483, #526): "I'm not NMC registered yet", "eligible for NMC registration", "pre-registration", "NMC Test of
 *   Competence (CBT) passed". A yes counts only by its own words, not by
 *   the requirement it answers: "I qualify in March" is a yes to the NMC gap, not NMC registration (#464). So a bare
 *   "Yes" supports nothing, which at worst leaves out a true line.
 */
export function roleClaimAdded(change: ProposedChange, sources: EvidenceSources): string | null {
  if (!sources.role) return null;
  const after = oneSpelling(change.after, "line");
  const before = oneSpelling(change.before ?? "", "line");
  return roleTerms(sources.role).find((roleTerm) => has(withoutJobsWanted(after, roleTerm), roleTerm.term) && !supportedRoleTerm(roleTerm, before, sources))?.display ?? null;
}

/**
 * A line that says the user is registered, outside the lines registration support usually comes from: their summary and
 * their degree (#466, #483). Only with "register", "registered" or "registration", not "pre-registration", and without
 * "not" before it, so "NMC approved" on a degree is no support. A clause that says the registration is not held now
 * has already lost its term in heldNow.
 */
const saysRegistered = (line: string) =>
  /(?<!\bpre-)\bregist(?:er|ered|ration)\b/.test(line) && !/\bnot\b[^,;.]*\bregist(?:er|ered|ration)\b/.test(line);

/** Whether something the user gave about themselves supports the term: see roleClaimAdded for what counts. */
function supportedRoleTerm(roleTerm: RoleTerm, before: string, { profile, answers }: EvidenceSources): boolean {
  const { term, kind } = roleTerm;
  const titles = profile.experience.map((job) => oneSpelling(job.title, "title"));
  // A tap is saved as "Yes, I have done this at work: <the requirement>." That part repeats the ad, not the user.
  const ownWords = (answer: string) => answer.replace(/^yes, i have done this (?:at work|in study or on my own): [^\n]*?\.(?:\s|$)/i, "");
  const shared = [
    ...profile.followUpAnswers.map((item) => item.answer),
    ...answers.filter((answer) => answer.hasExperience).map((answer) => ownWords(answer.answer)),
  ].map((line) => heldNow(oneSpelling(line), roleTerm));
  const own =
    kind === "level"
      ? [...titles, ...profile.experience.flatMap((job) => [...job.duties, ...job.achievements]).map((line) => promotedTo(oneSpelling(line), term))]
      : [
          ...titles,
          // Held now too (#526): "Preparing for NMC registration" is no registration, and nor is a skill about a test.
          ...profile.skills.map((line) => oneSpelling(line)).map((line) => (testSkill.test(line) ? "" : heldNow(line, roleTerm))),
          // A certificate's name, held now, and its issuer on its own, unless the name names a test ("OSCE passed",
          // issued by the NMC) or says it is not held ("Registration pending").
          ...profile.certifications.flatMap((item) => {
            const name = oneSpelling(item.name);
            if (namesTest.test(name)) return [];
            return [heldNow(name, roleTerm), saysNotHeld(name, term) ? "" : oneSpelling(item.issuer ?? "")];
          }),
          // Not about others, held now, and about being registered (#483). Titles skip withoutOthers: "Band 6 Sister" is their own.
          ...[profile.summary, ...profile.education.flatMap((item) => [item.qualification, item.subject ?? ""])]
            .map((line) => heldNow(withoutOthers(oneSpelling(line), term), roleTerm))
            .filter(saysRegistered),
        ];
  return [heldNow(withoutOthers(before, term), roleTerm), ...own, ...shared].some((line) => has(withoutJobsWanted(line, roleTerm), term));
}

/** "I am a", "As a", "I have worked as a", "I hold", "my": the ways a letter says something is the person's own. */
const firstPerson =
  "i am|i'm|i was|i have been|i've been|as|currently|work(?:ed|ing)? as|acted up into|acting up into|i was promoted to|promoted to|i hold|my";

/**
 * The ad's registration or Band that one sentence of a cover letter claims for the user and nothing they gave supports
 * (#466), with the same support as roleClaimAdded. Only a claim made in the first person counts: the term up to two words
 * after "I am a", "As a", "I have worked as a", "I acted up into", "I hold" or "my", or "registered with the NMC". So
 * "I am applying for the post of Senior Staff Nurse (Band 6)" and "This Band 6 role…" stay, and the job's title is taken
 * out only where it names the post. "B6" is never read as a Band here: in a letter it is a ward.
 */
export function letterRoleClaim(sentence: string, jobTitle: string, sources: EvidenceSources): string | null {
  if (!sources.role) return null;
  let text = oneSpelling(sentence);
  const title = escaped(oneSpelling(jobTitle));
  if (title) {
    text = text
      .replace(new RegExp(`\\b(for (?:the|this)|of(?: the)?)\\s+${title}`, "g"), "$1 ")
      .replace(new RegExp(`${title}(?=\\s+(?:post|role|position|vacancy)\\b)`, "g"), " ");
  }
  return (
    roleTerms(sources.role).find((roleTerm) => {
      const name = `\\(?${escaped(roleTerm.term)}\\)?(?![a-z0-9])`;
      const claim = new RegExp(`\\b(?:${firstPerson})\\s+(?:(?:an?|the)\\s+)?(?:[a-z0-9()-]+\\s+){0,2}${name}|\\bregistered with the ${name}`);
      return claim.test(withoutJobsWanted(text, roleTerm)) && !supportedRoleTerm(roleTerm, "", sources);
    })?.display ?? null
  );
}

/**
 * Words that make the work sound wider or more frequent than the user said (#487). In the Tailor v2 review (12
 * November), a field service engineer ticked three network tasks and the suggested line added "at each installation".
 * Both tailor prompts list the same words (tests/tailor/nothing-invented.test.ts checks it).
 */
export const scopeWords = [
  "each",
  "every",
  "all",
  "always",
  "regularly",
  "routinely",
  "daily",
  "weekly",
  "monthly",
  "consistently",
  "sole",
  "solely",
  "single-handedly",
  "independently",
  "entire",
  "entirely",
  "whole",
  "extensive",
  "extensively",
];

const scopeWord = new RegExp(`(?<![a-z0-9])(?:${scopeWords.map(escaped).join("|")})(?![a-z0-9])`, "g");

/** A tap is saved as "Yes, I have done this at work: <the requirement>." (actions.ts). That part is the ad's words. */
const tapPrefix = /^yes, i have done this (?:at work|in study or on my own): /;

/**
 * What the user said themselves in an answer or a quote from one: without the requirement a tap repeats, without a
 * quote of the ad's words alone, and without a clause that denies something ("I don't manage all 45 staff"). An answer
 * is the ad's words only when it repeats the whole requirement: "Weekly" to "How often…?" is the user's own (#526).
 */
function ownWordsIn(text: string, requirement: string, kind: "answer" | "quote"): string {
  let said = normalise(text);
  if (requirement && (kind === "quote" ? requirement.includes(said) : said === requirement)) return "";
  const tap = said.match(tapPrefix);
  if (tap) {
    said = said.slice(tap[0].length);
    if (requirement) {
      let index = 0;
      while (index < said.length && said[index] === requirement[index]) index += 1;
      said = said.slice(index);
    } else {
      const end = said.indexOf(". ");
      said = end >= 0 ? said.slice(end + 2) : "";
    }
  }
  return said
    .split(/[,;.]/)
    .filter((clause) => !/\b(?:not|never|no)\b|n't\b/.test(clause))
    .join(" ");
}

/**
 * The first such word the change adds, or null. A word counts as said when the line it rewrites has it, or the user's
 * own words in its evidence or their answer to the same gap, so "after every analysis step" from an answer may stay.
 * At worst a true line stays out. Exported for its test.
 */
export function scopeWordAdded(change: ProposedChange, sources: EvidenceSources): string | null {
  const gap = sources.gaps.find((item) => item.id === change.gapId);
  const requirement = gap ? normalise(gap.requirement) : "";
  const answers = change.gapId ? sources.answers.filter((item) => item.gapId === change.gapId).map((item) => ownWordsIn(item.answer, requirement, "answer")) : [];
  const said = new Set([normalise(change.before ?? ""), ownWordsIn(change.evidence, requirement, "quote"), ...answers].flatMap((text) => text.match(scopeWord) ?? []));
  return normalise(change.after).match(scopeWord)?.find((word) => !said.has(word)) ?? null;
}

/** An answer that says the user did only part of the work. */
const partly = /\b(?:partly|partially|only part|part of it|some of it)\b/;
/** Verbs that claim the whole of a piece of work. */
const wholeWorkVerbs = new Set(["led", "designed", "built", "created", "developed", "managed", "delivered", "owned", "ran", "headed", "directed", "launched"]);

/**
 * The verb a change starts with when it claims the whole of work the user said they did only part of, or null: a
 * "Partly" answer gives "Contributed to the design of…", never "Designed…". A line that already starts with that verb
 * keeps it. Exported for its test.
 */
export function wholeWorkClaimed(change: ProposedChange, sources: EvidenceSources): string | null {
  if (!change.gapId) return null;
  const answers = sources.answers.filter((item) => item.gapId === change.gapId).map((item) => normalise(item.answer));
  if (!answers.some((answer) => partly.test(answer))) return null;
  const first = normalise(change.after).split(" ")[0];
  return wholeWorkVerbs.has(first) && first !== normalise(change.before ?? "").split(" ")[0] ? first : null;
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

  const scope = scopeWordAdded(change, sources);
  if (scope) {
    return `It adds "${scope}", which makes the work sound wider or more frequent than the user said.`;
  }

  const whole = wholeWorkClaimed(change, sources);
  if (whole) {
    return `It starts with "${whole}", but the user said they did only part of this work.`;
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
