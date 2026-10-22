// The tailored CV: the user's Profile with only their approved changes applied (You approve everything).
// Pure code, shared by the preview and the PDF and Word export.
import type { Profile, TailoringChange } from "@/shared/contracts";

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
};

const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2024-06" becomes "Jun 2024"; null means the user still works there. */
export function formatMonth(value: string | null | undefined): string {
  if (value === null) return "Present";
  if (!value) return "";
  return month.format(new Date(`${value}-01T00:00:00Z`));
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Builds the CV from the Profile and the changes. Changes that are not approved are ignored entirely.
 * An approved change replaces its `before` line where it finds it; a new line (before: null) is added to its section.
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
  const added = (section: TailoringChange["section"]): CvLine[] =>
    approved
      .filter((change) => change.section === section && change.before === null && !used.has(change.id))
      .map((change) => (used.add(change.id), { text: change.after, tailored: true }));

  const summary = profile.summary.trim() ? apply(profile.summary, "summary") : (added("summary")[0] ?? null);

  const experience = profile.experience.map((job) => ({
    title: job.title,
    company: job.company,
    dates: [formatMonth(job.startDate), formatMonth(job.endDate)].filter(Boolean).join(" – "),
    lines: [...job.duties, ...job.achievements].map((line) => apply(line, "experience")),
  }));
  // A new experience line has no role to sit under, so it goes under the most recent one.
  const newExperience = added("experience");
  if (experience[0]) experience[0].lines.push(...newExperience);

  return {
    fullName: profile.fullName,
    contact: [profile.contact.email, profile.contact.phone, profile.contact.location, profile.contact.linkedIn].filter(
      (item): item is string => Boolean(item),
    ),
    summary,
    skills: [...profile.skills.map((skill) => apply(skill, "skills")), ...added("skills")],
    experience,
    education: [
      ...profile.education.map((item) =>
        apply([item.qualification, item.subject, item.institution, item.grade].filter(Boolean).join(", "), "education"),
      ),
      ...added("education"),
    ],
    certifications: [
      ...profile.certifications.map((item) =>
        apply([item.name, item.issuer, item.year].filter(Boolean).join(", "), "certifications"),
      ),
      ...added("certifications"),
    ],
  };
}
