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
  };
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
