import { z } from "zod";
import { ProfileSchema, type JobPreferences, type Profile, type WorkExperience } from "@/shared/contracts";
import { uniqueLines, type CvExtraction } from "./cv-extraction";
import { fitsProfileLimit, profileTooLongMessage } from "./cv-limits";
import { phoneProblem, tidyPhone } from "./phone";
import { count } from "./ui/format";
import { yearMonthProblem } from "./year-month";

// The review step: the user checks every item read from their CV (or, with no CV, fills the page in themselves),
// corrects what is wrong, then approves the whole page at once. Nothing is saved until they approve and every item
// passes its checks (You approve everything). Pure functions, so the page only renders this state, and tests cover
// the rules without a browser.

export type ContactDraft = { fullName: string; email: string; phone: string; location: string; linkedIn: string };
export type SummaryDraft = { text: string };
export type SkillsDraft = { list: string[] };
export type ExperienceDraft = {
  title: string;
  company: string;
  location: string;
  /** YYYY-MM, or "YYYY-" / "-MM" while only one of the Month and Year menus is chosen (year-month.ts). */
  startDate: string;
  endDate: string;
  current: boolean;
  /** True while a month is our guess, because the CV gave only the year. Editing the date clears it. */
  startGuessed: boolean;
  endGuessed: boolean;
  /** One per line. */
  duties: string;
  /** One per line. */
  achievements: string;
};
export type EducationDraft = {
  qualification: string;
  subject: string;
  institution: string;
  startDate: string;
  endDate: string;
  current: boolean;
  startGuessed: boolean;
  endGuessed: boolean;
  grade: string;
};
export type CertificationDraft = { name: string; issuer: string; year: string };

/** Error messages by field name, written for the user. */
export type FieldErrors = Record<string, string>;

export type ReviewEntry<T> = { key: string; value: T; errors: FieldErrors };

export type ReviewDraft = {
  contact: ReviewEntry<ContactDraft>;
  summary: ReviewEntry<SummaryDraft>;
  skills: ReviewEntry<SkillsDraft>;
  experience: ReviewEntry<ExperienceDraft>[];
  education: ReviewEntry<EducationDraft>[];
  certifications: ReviewEntry<CertificationDraft>[];
};

export type ListSection = "experience" | "education" | "certifications";

export type ReviewAction =
  | { type: "edit-contact"; change: Partial<ContactDraft> }
  | { type: "edit-summary"; text: string }
  | { type: "edit-skills"; list: string[] }
  | { type: "edit-experience"; key: string; change: Partial<ExperienceDraft> }
  | { type: "edit-education"; key: string; change: Partial<EducationDraft> }
  | { type: "edit-certification"; key: string; change: Partial<CertificationDraft> }
  /** Checks every item before the page is approved, and shows each problem. */
  | { type: "check" }
  | { type: "remove"; key: string }
  /** `key` comes from the caller, so the reducer stays pure. */
  | { type: "add"; section: ListSection; key: string };

/** The draft for a saved profile, to change it and approve it again. */
export function draftFromProfile(profile: Profile): ReviewDraft {
  return {
    contact: entry("contact", {
      fullName: profile.fullName,
      email: profile.contact.email ?? "",
      phone: tidyPhone(profile.contact.phone ?? ""),
      location: profile.contact.location ?? "",
      linkedIn: profile.contact.linkedIn ?? "",
    }),
    summary: entry("summary", { text: profile.summary }),
    skills: entry("skills", { list: [...profile.skills] }),
    experience: profile.experience.map((job, index) =>
      entry(`experience-${index}`, {
        title: job.title,
        company: job.company,
        location: job.location ?? "",
        startDate: job.startDate,
        endDate: job.endDate ?? "",
        current: job.endDate === null,
        startGuessed: false,
        endGuessed: false,
        duties: job.duties.join("\n"),
        achievements: job.achievements.join("\n"),
      }),
    ),
    education: profile.education.map((course, index) =>
      entry(`education-${index}`, {
        qualification: course.qualification,
        subject: course.subject ?? "",
        institution: course.institution,
        startDate: course.startDate ?? "",
        endDate: course.endDate ?? "",
        current: course.endDate === null,
        startGuessed: false,
        endGuessed: false,
        grade: course.grade ?? "",
      }),
    ),
    certifications: profile.certifications.map((certificate, index) =>
      entry(`certification-${index}`, {
        name: certificate.name,
        issuer: certificate.issuer ?? "",
        year: certificate.year?.toString() ?? "",
      }),
    ),
  };
}

/**
 * The review draft for a CV just read. Gaps stay empty, so approving asks the user to fill them;
 * a year without a month becomes January (start) or December (end), marked as a guess.
 */
export function draftFromExtraction(extraction: CvExtraction): ReviewDraft {
  const months = (start: string, end: string, current: boolean) => {
    const from = readCvMonth(start, "start");
    const to = current ? { month: "", guessed: false } : readCvMonth(end, "end");
    return { startDate: from.month, endDate: to.month, current, startGuessed: from.guessed, endGuessed: to.guessed };
  };
  return {
    contact: entry("contact", {
      fullName: extraction.fullName,
      email: extraction.contact.email ?? "",
      phone: tidyPhone(extraction.contact.phone ?? ""),
      location: extraction.contact.location ?? "",
      linkedIn: extraction.contact.linkedIn ?? "",
    }),
    summary: entry("summary", { text: extraction.summary }),
    skills: entry("skills", { list: [...extraction.skills] }),
    experience: extraction.experience.map((job, index) =>
      entry(`experience-${index}`, {
        title: job.title,
        company: job.company,
        location: job.location ?? "",
        ...months(job.startDate, job.endDate, job.current),
        duties: job.duties.join("\n"),
        achievements: job.achievements.join("\n"),
      }),
    ),
    education: extraction.education.map((course, index) =>
      entry(`education-${index}`, {
        qualification: course.qualification,
        subject: course.subject ?? "",
        institution: course.institution,
        ...months(course.startDate, course.endDate, course.current),
        grade: course.grade ?? "",
      }),
    ),
    certifications: extraction.certifications.map((certificate, index) =>
      entry(`certification-${index}`, {
        name: certificate.name,
        issuer: certificate.issuer ?? "",
        year: certificate.year?.toString() ?? "",
      }),
    ),
  };
}

/** The draft for a profile typed in by hand, with no CV: every section starts empty, for the user to fill in. */
export function emptyDraft(): ReviewDraft {
  return {
    contact: entry("contact", { fullName: "", email: "", phone: "", location: "", linkedIn: "" }),
    summary: entry("summary", { text: "" }),
    skills: entry("skills", { list: [] }),
    experience: [],
    education: [],
    certifications: [],
  };
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A CV date as YYYY-MM: "2021-09", "09/2021" and "Sept 2021" are read as they are; a year alone becomes
 * January or December and is marked as a guess. Anything else comes back empty, for the user to fill in.
 */
export function readCvMonth(text: string, side: "start" | "end"): { month: string; guessed: boolean } {
  const value = text.trim();
  const month = (year: string, number: string) => {
    const n = Number(number);
    return n >= 1 && n <= 12 ? { month: `${year}-${String(n).padStart(2, "0")}`, guessed: false } : { month: "", guessed: false };
  };

  let match = /^(\d{4})[-/](\d{1,2})$/.exec(value);
  if (match) return month(match[1], match[2]);
  match = /^(\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) return month(match[2], match[1]);
  match = /^([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(value);
  const named = match ? MONTH_NAMES.indexOf(match[1].slice(0, 3).toLowerCase()) : -1;
  if (match && named >= 0) return month(match[2], String(named + 1));
  if (/^\d{4}$/.test(value)) return { month: `${value}-${side === "start" ? "01" : "12"}`, guessed: true };
  return { month: "", guessed: false };
}

/** What a saved profile keeps that the review doesn't show: its id, the job preferences and the follow-up answers. */
export type ProfileBase = Pick<Profile, "id" | "preferences" | "followUpAnswers"> & {
  contact: Pick<Profile["contact"], "location">;
};

/**
 * The base for a new profile: a new id, preferences starting from the CV's location, and earlier answers.
 * A profile typed in by hand passes `{ contact: {} }`, so its preferences start empty.
 */
export function newProfileBase(
  extraction: Pick<CvExtraction, "contact">,
  details: { id: string; followUpAnswers: Profile["followUpAnswers"] },
): ProfileBase {
  const location = extraction.contact.location?.trim() ?? "";
  const preferences: JobPreferences = { salary: null, location, workModes: [], contractTypes: [], hours: [] };
  return { id: details.id, preferences, followUpAnswers: details.followUpAnswers, contact: { location: location || undefined } };
}

export function reviewReducer(draft: ReviewDraft, action: ReviewAction): ReviewDraft {
  switch (action.type) {
    case "edit-contact":
      return { ...draft, contact: edited(draft.contact, action.change) };
    case "edit-summary":
      return { ...draft, summary: edited(draft.summary, { text: action.text }) };
    case "edit-skills":
      return { ...draft, skills: edited(draft.skills, { list: action.list }) };
    case "edit-experience":
      return { ...draft, experience: editInList(draft.experience, action.key, withoutGuess(action.change)) };
    case "edit-education":
      return { ...draft, education: editInList(draft.education, action.key, withoutGuess(action.change)) };
    case "edit-certification":
      return { ...draft, certifications: editInList(draft.certifications, action.key, action.change) };
    case "check":
      return checkAll(draft);
    case "remove":
      return {
        ...draft,
        experience: draft.experience.filter((item) => item.key !== action.key),
        education: draft.education.filter((item) => item.key !== action.key),
        certifications: draft.certifications.filter((item) => item.key !== action.key),
      };
    case "add":
      if (action.section === "experience") {
        return { ...draft, experience: [...draft.experience, entry(action.key, emptyExperience())] };
      }
      if (action.section === "education") {
        return { ...draft, education: [...draft.education, entry(action.key, emptyEducation())] };
      }
      return { ...draft, certifications: [...draft.certifications, entry(action.key, { name: "", issuer: "", year: "" })] };
  }
}

/** The keys of the items with a problem to fix, in the order the page shows them. Empty until the draft is checked. */
export function itemsWithProblems(draft: ReviewDraft): string[] {
  return [
    draft.contact,
    draft.summary,
    ...draft.experience,
    ...draft.education,
    ...draft.certifications,
    draft.skills,
  ]
    .filter((item) => Object.keys(item.errors).length > 0)
    .map((item) => item.key);
}

/**
 * The approved draft as a Profile. `base` supplies what the review does not show
 * (id, job preferences and follow-up answers). Throws if an item is invalid, which checking first prevents.
 */
export function profileFromDraft(draft: ReviewDraft, base: ProfileBase): Profile {
  const contact = draft.contact.value;
  const location = optional(contact.location);
  // Job preferences start from the CV's location (empty for a profile typed in by hand); keep them in step unless
  // the user has set them apart.
  const preferencesFollowContact = base.preferences.location === (base.contact.location ?? "");

  const experience: WorkExperience[] = draft.experience.map(({ value }) => ({
    title: value.title.trim(),
    company: value.company.trim(),
    location: optional(value.location),
    startDate: value.startDate.trim(),
    endDate: value.current ? null : value.endDate.trim(),
    duties: splitLines(value.duties),
    achievements: splitLines(value.achievements),
  }));

  return ProfileSchema.parse({
    id: base.id,
    followUpAnswers: base.followUpAnswers,
    fullName: contact.fullName.trim(),
    contact: {
      email: optional(contact.email),
      phone: optional(tidyPhone(contact.phone)),
      location,
      linkedIn: normaliseLink(contact.linkedIn),
    },
    summary: draft.summary.value.text.trim(),
    skills: uniqueLines(draft.skills.value.list),
    experience: sortMostRecentFirst(experience),
    education: draft.education.map(({ value }) => ({
      institution: value.institution.trim(),
      qualification: value.qualification.trim(),
      subject: optional(value.subject),
      startDate: optional(value.startDate),
      endDate: value.current ? null : optional(value.endDate),
      grade: optional(value.grade),
    })),
    certifications: draft.certifications.map(({ value }) => ({
      name: value.name.trim(),
      issuer: optional(value.issuer),
      year: value.year.trim() ? Number(value.year) : undefined,
    })),
    preferences: preferencesFollowContact ? { ...base.preferences, location: location ?? "" } : base.preferences,
  });
}

/**
 * What the one Approve button does with a checked draft: the profile to save, or what the page says instead and
 * where focus goes (the first item to fix, the consent box, or nowhere). `consentMissing` is true while the page asks
 * for consent, for a profile typed in by hand, and the box isn't ticked.
 */
export type Approval =
  | { ok: true; profile: Profile }
  | { ok: false; message: string | null; focus: { item: string } | "consent" | null };

export function approvalFor(checked: ReviewDraft, base: ProfileBase, consentMissing: boolean): Approval {
  const problems = itemsWithProblems(checked);
  if (problems.length > 0) {
    const andConsent = consentMissing ? " and tick the box to agree" : "";
    return {
      ok: false,
      message: `Fix the ${count(problems.length, "item")} marked above${andConsent}, then approve again.`,
      focus: { item: problems[0] },
    };
  }
  // The consent box shows its own message.
  if (consentMissing) return { ok: false, message: null, focus: "consent" };
  let profile: Profile;
  try {
    profile = profileFromDraft(checked, base);
  } catch {
    return { ok: false, message: "Some details are not valid. Check them, then approve again.", focus: null };
  }
  if (!fitsProfileLimit(profile)) return { ok: false, message: profileTooLongMessage, focus: null };
  return { ok: true, profile };
}

// --- Validation -------------------------------------------------------------------------------

/** What to say about a date picked with the Month and Year menus (#186), or undefined when it is whole. */
function dateError(value: string, missing: string | undefined): string | undefined {
  const problem = yearMonthProblem(value);
  if (problem === null) return undefined;
  if (problem === "missing") return missing;
  if (problem === "month") return "Choose the month too.";
  if (problem === "year") return "Choose the year too.";
  return "Choose the month and year.";
}

/** True when both dates are whole and the end comes before the start. */
function endsBeforeStart(start: string, end: string): boolean {
  return yearMonthProblem(start) === null && yearMonthProblem(end) === null && end.trim() < start.trim();
}

export function validateContact(value: ContactDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.fullName.trim()) errors.fullName = "Add your full name.";
  if (value.email.trim() && !z.email().safeParse(value.email.trim()).success) {
    errors.email = "Check the email address, for example name@example.com.";
  }
  const phone = phoneProblem(value.phone);
  if (phone) errors.phone = phone;
  const link = normaliseLink(value.linkedIn);
  if (link !== undefined && !isWebLink(link)) {
    errors.linkedIn = "Check the link, for example https://www.linkedin.com/in/your-name.";
  }
  return errors;
}

export function validateExperience(value: ExperienceDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.title.trim()) errors.title = "Add the job title.";
  if (!value.company.trim()) errors.company = "Add the employer’s name.";
  const startError = dateError(value.startDate, "Add the month and year you started.");
  if (startError) errors.startDate = startError;
  if (!value.current) {
    const endError = dateError(value.endDate, "Add the month and year you left, or tick “I still work here”.");
    if (endError) errors.endDate = endError;
    else if (endsBeforeStart(value.startDate, value.endDate)) errors.endDate = "The end month is before the start month.";
  }
  return errors;
}

export function validateEducation(value: EducationDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.qualification.trim()) errors.qualification = "Add the qualification, for example BSc or A levels.";
  if (!value.institution.trim()) errors.institution = "Add where you studied.";
  // Both dates are optional here, so only a half-chosen date is a problem.
  const startError = dateError(value.startDate, undefined);
  if (startError) errors.startDate = startError;
  if (!value.current) {
    const endError = dateError(value.endDate, undefined);
    if (endError) errors.endDate = endError;
    else if (endsBeforeStart(value.startDate, value.endDate)) errors.endDate = "The end month is before the start month.";
  }
  return errors;
}

export function validateCertification(value: CertificationDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.name.trim()) errors.name = "Add the certificate’s name.";
  const year = value.year.trim();
  if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1950 && Number(year) <= 2100)) {
    errors.year = "Use a four-digit year, for example 2024.";
  }
  return errors;
}

// --- Helpers ----------------------------------------------------------------------------------

function entry<T>(key: string, value: T): ReviewEntry<T> {
  return { key, value, errors: {} };
}

/** An edit clears the errors of the fields it changed; the next check looks at them again. */
function edited<T extends object>(item: ReviewEntry<T>, change: Partial<T>): ReviewEntry<T> {
  const errors = { ...item.errors };
  for (const field of Object.keys(change)) delete errors[field];
  return { ...item, value: { ...item.value, ...change }, errors };
}

function editInList<T extends object>(items: ReviewEntry<T>[], key: string, change: Partial<T>): ReviewEntry<T>[] {
  return items.map((item) => (item.key === key ? edited(item, change) : item));
}

function checkAll(draft: ReviewDraft): ReviewDraft {
  const check = <T>(item: ReviewEntry<T>, validate: (value: T) => FieldErrors): ReviewEntry<T> => ({
    ...item,
    errors: validate(item.value),
  });
  return {
    contact: check(draft.contact, validateContact),
    // The personal statement and the skills have nothing to check: either may be empty.
    summary: draft.summary,
    skills: draft.skills,
    experience: draft.experience.map((item) => check(item, validateExperience)),
    education: draft.education.map((item) => check(item, validateEducation)),
    certifications: draft.certifications.map((item) => check(item, validateCertification)),
  };
}

function emptyExperience(): ExperienceDraft {
  const dates = { startDate: "", endDate: "", current: false, startGuessed: false, endGuessed: false };
  return { title: "", company: "", location: "", ...dates, duties: "", achievements: "" };
}

function emptyEducation(): EducationDraft {
  const dates = { startDate: "", endDate: "", current: false, startGuessed: false, endGuessed: false };
  return { qualification: "", subject: "", institution: "", ...dates, grade: "" };
}

/** A date the user has touched is no longer our guess. */
function withoutGuess<T extends { startDate?: string; endDate?: string; startGuessed?: boolean; endGuessed?: boolean }>(
  change: T,
): T {
  return {
    ...change,
    ...("startDate" in change ? { startGuessed: false } : {}),
    ...("endDate" in change ? { endGuessed: false } : {}),
  };
}

function splitLines(text: string): string[] {
  return uniqueLines(text.split("\n").map((line) => line.replace(/^\s*[•·*-]\s+/, "")));
}

/** Current jobs first, then by start month, newest first: the usual order on a UK CV. */
function sortMostRecentFirst(jobs: WorkExperience[]): WorkExperience[] {
  return [...jobs].sort((a, b) => {
    if ((a.endDate === null) !== (b.endDate === null)) return a.endDate === null ? -1 : 1;
    return b.startDate.localeCompare(a.startDate);
  });
}

function optional(value: string): string | undefined {
  return value.trim() || undefined;
}

/** Adds https:// to a link typed without it, e.g. "linkedin.com/in/sara". */
export function normaliseLink(value: string): string | undefined {
  const link = value.trim();
  if (!link) return undefined;
  return /^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`;
}

/** Only http and https links, so a link can never run script when shown. */
function isWebLink(link: string): boolean {
  try {
    const url = new URL(link);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}
