import { z } from "zod";
import { ProfileSchema, type Profile, type WorkExperience } from "@/shared/contracts";
import { uniqueLines } from "./cv-extraction";

// The review step: the user checks every item read from their CV, corrects it if needed and approves it.
// Nothing is saved until every item is approved (You approve everything). Pure functions, so the
// page only renders this state, and tests cover the rules without a browser.

export type ContactDraft = { fullName: string; email: string; phone: string; location: string; linkedIn: string };
export type SummaryDraft = { text: string };
export type SkillsDraft = { list: string[] };
export type ExperienceDraft = {
  title: string;
  company: string;
  location: string;
  /** YYYY-MM, as typed. */
  startDate: string;
  endDate: string;
  current: boolean;
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
  grade: string;
};
export type CertificationDraft = { name: string; issuer: string; year: string };

/** Error messages by field name, written for the user. */
export type FieldErrors = Record<string, string>;

export type ReviewEntry<T> = { key: string; value: T; approved: boolean; errors: FieldErrors };

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
  /** Approves the item if it is valid; otherwise shows its errors. */
  | { type: "approve"; key: string }
  | { type: "unapprove"; key: string }
  | { type: "remove"; key: string }
  /** `key` comes from the caller, so the reducer stays pure. */
  | { type: "add"; section: ListSection; key: string };

export function draftFromProfile(profile: Profile): ReviewDraft {
  return {
    contact: entry("contact", {
      fullName: profile.fullName,
      email: profile.contact.email ?? "",
      phone: profile.contact.phone ?? "",
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

export function reviewReducer(draft: ReviewDraft, action: ReviewAction): ReviewDraft {
  switch (action.type) {
    case "edit-contact":
      return { ...draft, contact: edited(draft.contact, action.change) };
    case "edit-summary":
      return { ...draft, summary: edited(draft.summary, { text: action.text }) };
    case "edit-skills":
      return { ...draft, skills: edited(draft.skills, { list: action.list }) };
    case "edit-experience":
      return { ...draft, experience: editInList(draft.experience, action.key, action.change) };
    case "edit-education":
      return { ...draft, education: editInList(draft.education, action.key, action.change) };
    case "edit-certification":
      return { ...draft, certifications: editInList(draft.certifications, action.key, action.change) };
    case "approve":
      return approve(draft, action.key);
    case "unapprove":
      return mapEntries(draft, action.key, (item) => ({ ...item, approved: false }));
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

/** How many items are approved, out of how many. */
export function reviewProgress(draft: ReviewDraft): { approved: number; total: number } {
  const items = allEntries(draft);
  return { approved: items.filter((item) => item.approved).length, total: items.length };
}

export function isFullyApproved(draft: ReviewDraft): boolean {
  const { approved, total } = reviewProgress(draft);
  return approved === total;
}

/**
 * The approved draft as a Profile. `base` supplies what the review does not show
 * (id, job preferences and follow-up answers). Throws if an item is invalid, which approval prevents.
 */
export function profileFromDraft(draft: ReviewDraft, base: Profile): Profile {
  const contact = draft.contact.value;
  const location = optional(contact.location);
  // Job preferences start from the CV's location; keep them in step unless the user has set them apart.
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
    ...base,
    fullName: contact.fullName.trim(),
    contact: {
      email: optional(contact.email),
      phone: optional(contact.phone),
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

// --- Validation -------------------------------------------------------------------------------

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthExample = "Use a month in the form YYYY-MM, for example 2021-09.";

export function validateContact(value: ContactDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.fullName.trim()) errors.fullName = "Add your full name.";
  if (value.email.trim() && !z.email().safeParse(value.email.trim()).success) {
    errors.email = "Check the email address, for example name@example.com.";
  }
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
  const start = value.startDate.trim();
  const end = value.endDate.trim();
  if (!YEAR_MONTH.test(start)) errors.startDate = `Add the month you started. ${monthExample}`;
  if (!value.current) {
    if (!end) errors.endDate = "Add the month you left, or tick “I still work here”.";
    else if (!YEAR_MONTH.test(end)) errors.endDate = monthExample;
    else if (YEAR_MONTH.test(start) && end < start) errors.endDate = "The end month is before the start month.";
  }
  return errors;
}

export function validateEducation(value: EducationDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.qualification.trim()) errors.qualification = "Add the qualification, for example BSc or A levels.";
  if (!value.institution.trim()) errors.institution = "Add where you studied.";
  const start = value.startDate.trim();
  const end = value.endDate.trim();
  if (start && !YEAR_MONTH.test(start)) errors.startDate = monthExample;
  if (!value.current && end) {
    if (!YEAR_MONTH.test(end)) errors.endDate = monthExample;
    else if (YEAR_MONTH.test(start) && end < start) errors.endDate = "The end month is before the start month.";
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
  return { key, value, approved: false, errors: {} };
}

/** An edit means the item needs checking again, and clears the errors of the fields it changed. */
function edited<T extends object>(item: ReviewEntry<T>, change: Partial<T>): ReviewEntry<T> {
  const errors = { ...item.errors };
  for (const field of Object.keys(change)) delete errors[field];
  return { ...item, value: { ...item.value, ...change }, approved: false, errors };
}

function editInList<T extends object>(items: ReviewEntry<T>[], key: string, change: Partial<T>): ReviewEntry<T>[] {
  return items.map((item) => (item.key === key ? edited(item, change) : item));
}

function approve(draft: ReviewDraft, key: string): ReviewDraft {
  const check = <T>(item: ReviewEntry<T>, validate: (value: T) => FieldErrors): ReviewEntry<T> => {
    const errors = validate(item.value);
    return { ...item, errors, approved: Object.keys(errors).length === 0 };
  };
  return {
    ...draft,
    contact: draft.contact.key === key ? check(draft.contact, validateContact) : draft.contact,
    summary: draft.summary.key === key ? check(draft.summary, () => ({})) : draft.summary,
    skills: draft.skills.key === key ? check(draft.skills, () => ({})) : draft.skills,
    experience: draft.experience.map((item) => (item.key === key ? check(item, validateExperience) : item)),
    education: draft.education.map((item) => (item.key === key ? check(item, validateEducation) : item)),
    certifications: draft.certifications.map((item) => (item.key === key ? check(item, validateCertification) : item)),
  };
}

type AnyEntry = ReviewEntry<unknown>;

function mapEntries(draft: ReviewDraft, key: string, change: (item: AnyEntry) => AnyEntry): ReviewDraft {
  const apply = <T>(item: ReviewEntry<T>): ReviewEntry<T> => (item.key === key ? (change(item) as ReviewEntry<T>) : item);
  return {
    contact: apply(draft.contact),
    summary: apply(draft.summary),
    skills: apply(draft.skills),
    experience: draft.experience.map(apply),
    education: draft.education.map(apply),
    certifications: draft.certifications.map(apply),
  };
}

function allEntries(draft: ReviewDraft): AnyEntry[] {
  return [draft.contact, draft.summary, draft.skills, ...draft.experience, ...draft.education, ...draft.certifications];
}

function emptyExperience(): ExperienceDraft {
  return { title: "", company: "", location: "", startDate: "", endDate: "", current: false, duties: "", achievements: "" };
}

function emptyEducation(): EducationDraft {
  return { qualification: "", subject: "", institution: "", startDate: "", endDate: "", current: false, grade: "" };
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
