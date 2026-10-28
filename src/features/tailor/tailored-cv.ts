// The tailored CV: the user's Profile with only their approved changes applied (You approve everything).
// Pure code, shared by the preview and the PDF and Word export.
import type { Profile, TailoringChange } from "@/shared/contracts";
import { normalise } from "./nothing-invented";

/** One line of the tailored CV; `tailored` marks a line that came from an approved change. */
export type CvLine = { text: string; tailored: boolean };

export type TailoredCv = {
  fullName: string;
  contact: string[];
  summary: CvLine | null;
  skills: CvLine[];
  experience: {
    title: string;
    company: string;
    dates: string;
    lines: CvLine[];
  }[];
  education: CvLine[];
  certifications: CvLine[];
  /** Approved changes whose `before` line is not on the CV (or was already changed), so they could not be placed. */
  unplaced: TailoringChange[];
};

const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2024-06" becomes "Jun 2024"; null means the user still works there. */
export function formatMonth(value: string | null | undefined): string {
  if (value === null) return "Present";
  if (!value) return "";
  return month.format(new Date(`${value}-01T00:00:00Z`));
}

function same(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

/** A tailored CV shows at most this many skills: a short list a recruiter reads, not every skill the user has. */
export const maxSkills = 6;

/**
 * The skills the CV shows: every skill the user approved for this job first, then their own first skills, kept in
 * the CV's order, up to six. Nothing is added; the rest stay in the Profile.
 */
function mainSkills(skills: CvLine[]): CvLine[] {
  const keep = new Set([...skills.filter((line) => line.tailored), ...skills.filter((line) => !line.tailored)].slice(0, maxSkills));
  return skills.filter((line) => keep.has(line));
}

/** An education entry as one CV line, e.g. "MSc, Data Science, University of Manchester, Merit". */
function educationLine(item: Profile["education"][number]): string {
  return [item.qualification, item.subject, item.institution, item.grade].filter(Boolean).join(", ");
}

/** A certificate as one CV line, e.g. "Tableau Desktop Specialist, Tableau, 2023". */
function certificationLine(item: Profile["certifications"][number]): string {
  return [item.name, item.issuer, item.year].filter(Boolean).join(", ");
}

/** The CV's lines in one section, exactly as the tailored CV shows them: a change's `before` must be one of these. */
export function sectionLines(profile: Profile, section: TailoringChange["section"]): string[] {
  switch (section) {
    case "summary":
      return profile.summary.trim() ? [profile.summary] : [];
    case "skills":
      return profile.skills;
    case "experience":
      return profile.experience.flatMap((job) => [...job.duties, ...job.achievements]);
    case "education":
      return profile.education.map(educationLine);
    case "certifications":
      return profile.certifications.map(certificationLine);
  }
}

/** True when the change can go into this CV: a new line, or a `before` that is one of the section's lines. */
export function fitsCv(profile: Profile, change: Pick<TailoringChange, "section" | "before">): boolean {
  const { before } = change;
  return before === null || sectionLines(profile, change.section).some((line) => same(line, before));
}

/**
 * Builds the CV from the Profile and the changes. Changes that are not approved are ignored entirely.
 * An approved change replaces its `before` line where it finds it; a new line (before: null) is added to its section.
 * An approved change that finds no line is never dropped silently: it is listed in `unplaced` for the page to show.
 */
export function buildTailoredCv(profile: Profile, changes: TailoringChange[]): TailoredCv {
  const approved = changes.filter((change) => change.status === "approved");
  const used = new Set<string>();

  /** Swaps a CV line for its approved change, if there is one. */
  const apply = (text: string, section: TailoringChange["section"]): CvLine => {
    const change = approved.find((item) => item.section === section && !used.has(item.id) && item.before !== null && same(item.before, text));
    if (!change) return { text, tailored: false };
    used.add(change.id);
    return { text: change.after, tailored: true };
  };
  const added = (section: TailoringChange["section"], max = Infinity): CvLine[] =>
    approved
      .filter((change) => change.section === section && change.before === null && !used.has(change.id))
      .slice(0, max)
      .map((change) => (used.add(change.id), { text: change.after, tailored: true }));

  const summary = profile.summary.trim() ? apply(profile.summary, "summary") : (added("summary", 1)[0] ?? null);

  const experience = profile.experience.map((job) => ({
    title: job.title,
    company: job.company,
    dates: [formatMonth(job.startDate), formatMonth(job.endDate)].filter(Boolean).join(" – "),
    lines: [...job.duties, ...job.achievements].map((line) => apply(line, "experience")),
  }));
  // A new experience line has no role to sit under, so it goes under the most recent one.
  if (experience[0]) experience[0].lines.push(...added("experience"));

  return {
    fullName: profile.fullName,
    contact: [profile.contact.email, profile.contact.phone, profile.contact.location, profile.contact.linkedIn].filter(
      (item): item is string => Boolean(item),
    ),
    summary,
    skills: mainSkills([...profile.skills.map((skill) => apply(skill, "skills")), ...added("skills")]),
    experience,
    education: [...profile.education.map((item) => apply(educationLine(item), "education")), ...added("education")],
    certifications: [
      ...profile.certifications.map((item) => apply(certificationLine(item), "certifications")),
      ...added("certifications"),
    ],
    unplaced: approved.filter((change) => !used.has(change.id)),
  };
}
