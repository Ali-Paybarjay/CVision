// The tailored CV: the user's Profile with only their approved changes applied (You approve everything).
// Pure code, shared by the preview and the PDF and Word export.
import type { Profile, TailoringChange } from "@/shared/contracts";
import { isBigSix } from "./big-six";
import { normalise } from "./nothing-invented";

/** One line of the tailored CV; `tailored` marks a line that came from an approved change. */
export type CvLine = {
  text: string;
  tailored: boolean;
  /** Printed in bold before the text, e.g. the main skill a line shows: "Communication:" before "Walked managers through…". */
  label?: string;
};

/** The section headings of the CV template (docs/tailor-templates), the same in the preview and the files. */
export const cvHeadings = {
  summary: "PROFESSIONAL SUMMARY",
  skills: "PROFESSIONAL SKILLS AND INTERESTS",
  education: "EDUCATION",
  experience: "PROFESSIONAL SKILLS DEMONSTRATED",
  projects: "PROJECTS",
  volunteering: "VOLUNTEERING",
  other: "CERTIFICATES AND SKILLS",
  certificates: "Certificates:",
  technical: "Skills and tools:",
  languages: "LANGUAGES",
};

/** A job, project or volunteering role on the CV. `company` is empty when the CV names no organisation. */
export type CvEntry = {
  title: string;
  company: string;
  dates: string;
  lines: CvLine[];
};

export type TailoredCv = {
  fullName: string;
  contact: string[];
  summary: CvLine | null;
  /** The six main skills, such as Communication. */
  skills: CvLine[];
  /** Software, tools and anything else that is not a main skill, listed as "Skills and tools" in the last section of the CV. */
  technicalSkills: CvLine[];
  experience: CvEntry[];
  education: CvLine[];
  certifications: CvLine[];
  projects: CvEntry[];
  volunteering: CvEntry[];
  languages: CvLine[];
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

/** An education entry as one CV line, e.g. "MSc, Data Science, University of Manchester, Merit". */
function educationLine(item: Profile["education"][number]): string {
  return [item.qualification, item.subject, item.institution, item.grade].filter(Boolean).join(", ");
}

/** A certificate as one CV line, e.g. "Tableau Desktop Specialist, Tableau, 2023". */
function certificationLine(item: Profile["certifications"][number]): string {
  return [item.name, item.issuer, item.year].filter(Boolean).join(", ");
}

function dateRange(start: string | null | undefined, end: string | null | undefined): string {
  return [formatMonth(start), formatMonth(end)].filter(Boolean).join(" – ");
}

/** A line the model never changes: these sections take no tailoring changes yet. */
function asIs(text: string): CvLine {
  return { text, tailored: false };
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

  // Approving a main skill also marks the CV line that shows it, as the template does.
  const shown = approved.filter((change) => change.section === "skills" && change.before === null && change.evidenceSource === "cv" && isBigSix(change.after));
  const withSkill = (original: string, line: CvLine): CvLine => {
    const skill = shown.find((change) => normalise(original).includes(normalise(change.evidence)));
    return skill ? { ...line, label: `${skill.after.trim()}:` } : line;
  };

  const summary = profile.summary.trim() ? apply(profile.summary, "summary") : (added("summary", 1)[0] ?? null);

  const experience = profile.experience.map((job) => ({
    title: job.title,
    company: job.company,
    dates: dateRange(job.startDate, job.endDate),
    lines: [...job.duties, ...job.achievements].map((line) => withSkill(line, apply(line, "experience"))),
  }));
  // A new experience line has no role to sit under, so it goes under the most recent one.
  if (experience[0]) experience[0].lines.push(...added("experience"));

  const skills = [...profile.skills.map((skill) => apply(skill, "skills")), ...added("skills")];
  // Laid out as the template: "MSc (Data Science), Merit." in bold, then the institution. A tailored line stays as approved.
  const education = profile.education.map((item) => {
    const line = apply(educationLine(item), "education");
    if (line.tailored) return line;
    const degree = `${item.qualification}${item.subject ? ` (${item.subject})` : ""}${item.grade ? `, ${item.grade}` : ""}.`;
    return { ...line, label: degree, text: item.institution };
  });
  const certifications = profile.certifications.map((item) => {
    const line = apply(certificationLine(item), "certifications");
    if (line.tailored) return line;
    return { ...line, text: `${item.name}${item.issuer ? ` – ${item.issuer}` : ""}${item.year ? ` (${item.year})` : ""}` };
  });

  return {
    fullName: profile.fullName,
    contact: [profile.contact.email, profile.contact.phone, profile.contact.location, profile.contact.linkedIn].filter(
      (item): item is string => Boolean(item),
    ),
    summary,
    skills: skills.filter((line) => isBigSix(line.text)),
    technicalSkills: skills.filter((line) => !isBigSix(line.text)),
    experience,
    education: [...education, ...added("education")],
    certifications: [...certifications, ...added("certifications")],
    projects: (profile.projects ?? []).map((item) => ({ title: item.name, company: item.organisation ?? "", dates: dateRange(item.startDate, item.endDate), lines: item.details.map(asIs) })),
    volunteering: (profile.volunteering ?? []).map((item) => ({
      title: item.role,
      company: [item.organisation, item.location].filter(Boolean).join(", "),
      dates: dateRange(item.startDate, item.endDate),
      lines: item.details.map(asIs),
    })),
    languages: (profile.languages ?? []).map((item) => asIs(item.level ? `${item.name} (${item.level})` : item.name)),
    unplaced: approved.filter((change) => !used.has(change.id)),
  };
}
