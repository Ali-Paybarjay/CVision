import { z } from "zod";
import type { Profile } from "@/shared/contracts";

// What the model reads from a CV. It is looser than the Profile contract on purpose: a freelance job with no
// employer, a course with no dates or a name the model can't find stays empty, instead of the model having to
// invent something or the whole reading failing. The review step then asks the user to fill each gap,
// and only a complete, approved profile is saved (You approve everything).

/** A date as the CV gives it: "2021-09", "2021" when it gives only the year, or "" when it gives none. */
const CvDateSchema = z.string();

const CvJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  startDate: CvDateSchema,
  endDate: CvDateSchema,
  /** True when the CV says the user still works there ("present", "current", "to date"). */
  current: z.boolean(),
  duties: z.array(z.string()),
  achievements: z.array(z.string()),
});

const CvCourseSchema = z.object({
  institution: z.string(),
  qualification: z.string(),
  subject: z.string().optional(),
  startDate: CvDateSchema,
  endDate: CvDateSchema,
  /** True when the CV says the user is still studying for it. */
  current: z.boolean(),
  grade: z.string().optional(),
});

const CvCertificateSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  year: z.number().int().optional(),
});

const CvLanguageSchema = z.object({
  name: z.string(),
  /** Only when the CV gives one ("Native", "Fluent", "B2"). */
  level: z.string().optional(),
});

const CvProjectSchema = z.object({
  name: z.string(),
  organisation: z.string().optional(),
  startDate: CvDateSchema,
  endDate: CvDateSchema,
  /** True when the CV says the user is still working on it. */
  current: z.boolean(),
  details: z.array(z.string()),
  url: z.string().optional(),
});

const CvVolunteeringSchema = z.object({
  role: z.string(),
  organisation: z.string().optional(),
  location: z.string().optional(),
  startDate: CvDateSchema,
  endDate: CvDateSchema,
  /** True when the CV says the user still does it. */
  current: z.boolean(),
  details: z.array(z.string()),
});

/** What the model reads from a CV (see prompts/profile-extract.md), and what the review step starts from. */
export const CvExtractionSchema = z.object({
  fullName: z.string(),
  contact: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedIn: z.string().optional(),
  }),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(CvJobSchema),
  education: z.array(CvCourseSchema),
  certifications: z.array(CvCertificateSchema),
  languages: z.array(CvLanguageSchema),
  projects: z.array(CvProjectSchema),
  volunteering: z.array(CvVolunteeringSchema),
});
export type CvExtraction = z.infer<typeof CvExtractionSchema>;

/** Trims every field and drops empty and repeated lines, so the review step starts tidy. */
export function tidyExtraction(extraction: CvExtraction): CvExtraction {
  const text = (value: string | undefined) => value?.trim() ?? "";
  const optional = (value: string | undefined) => value?.trim() || undefined;
  return {
    fullName: text(extraction.fullName),
    contact: {
      email: optional(extraction.contact.email),
      phone: optional(extraction.contact.phone),
      location: optional(extraction.contact.location),
      linkedIn: optional(extraction.contact.linkedIn),
    },
    summary: text(extraction.summary),
    skills: uniqueLines(extraction.skills),
    experience: extraction.experience.map((job) => ({
      title: text(job.title),
      company: text(job.company),
      location: optional(job.location),
      startDate: text(job.startDate),
      endDate: job.current ? "" : text(job.endDate),
      current: job.current,
      duties: uniqueLines(job.duties),
      achievements: uniqueLines(job.achievements),
    })),
    education: extraction.education.map((course) => ({
      institution: text(course.institution),
      qualification: text(course.qualification),
      subject: optional(course.subject),
      startDate: text(course.startDate),
      endDate: course.current ? "" : text(course.endDate),
      current: course.current,
      grade: optional(course.grade),
    })),
    certifications: extraction.certifications
      .map((certificate) => ({ name: text(certificate.name), issuer: optional(certificate.issuer), year: certificate.year }))
      .filter((certificate) => certificate.name !== "" || certificate.issuer !== undefined),
    // A level with no language is nothing to complete, so it goes.
    languages: extraction.languages
      .map((language) => ({ name: text(language.name), level: optional(language.level) }))
      .filter((language) => language.name !== ""),
    // A project or a role the CV says something about stays, for the user to complete; an empty one goes.
    projects: extraction.projects
      .map((project) => ({
        name: text(project.name),
        organisation: optional(project.organisation),
        startDate: text(project.startDate),
        endDate: project.current ? "" : text(project.endDate),
        current: project.current,
        details: uniqueLines(project.details),
        url: optional(project.url),
      }))
      .filter(
        (project) =>
          project.name !== "" || project.organisation !== undefined || project.details.length > 0 || project.url !== undefined,
      ),
    volunteering: extraction.volunteering
      .map((role) => ({
        role: text(role.role),
        organisation: optional(role.organisation),
        location: optional(role.location),
        startDate: text(role.startDate),
        endDate: role.current ? "" : text(role.endDate),
        current: role.current,
        details: uniqueLines(role.details),
      }))
      .filter((role) => role.role !== "" || role.organisation !== undefined || role.details.length > 0)
      // A role the CV lists among its jobs stays a job (prompts/profile-extract.md), so a copy of it here goes.
      .filter(
        (role) => !extraction.experience.some((job) => sameText(job.title, role.role) && sameText(job.company, role.organisation ?? "")),
      ),
  };
}

/** The same words, ignoring case and the spaces around them. */
function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A profile written the way the model answers: the mock answer for a sample CV. */
export function extractionFromProfile(profile: Profile): CvExtraction {
  return {
    fullName: profile.fullName,
    contact: { ...profile.contact },
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience.map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      startDate: job.startDate,
      endDate: job.endDate ?? "",
      current: job.endDate === null,
      duties: job.duties,
      achievements: job.achievements,
    })),
    education: profile.education.map((course) => ({
      institution: course.institution,
      qualification: course.qualification,
      subject: course.subject,
      startDate: course.startDate ?? "",
      endDate: course.endDate ?? "",
      current: course.endDate === null,
      grade: course.grade,
    })),
    certifications: profile.certifications.map((certificate) => ({ ...certificate })),
    languages: (profile.languages ?? []).map((language) => ({ ...language })),
    projects: (profile.projects ?? []).map((project) => ({
      name: project.name,
      organisation: project.organisation,
      startDate: project.startDate ?? "",
      endDate: project.endDate ?? "",
      current: project.endDate === null,
      details: project.details,
      url: project.url,
    })),
    volunteering: (profile.volunteering ?? []).map((role) => ({
      role: role.role,
      organisation: role.organisation,
      location: role.location,
      startDate: role.startDate ?? "",
      endDate: role.endDate ?? "",
      current: role.endDate === null,
      details: role.details,
    })),
  };
}

/** Trims each line, drops empty ones and repeats (ignoring case), and keeps the order. */
export function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const text = line.trim();
    const key = text.toLowerCase();
    if (text && !seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
  }
  return result;
}
