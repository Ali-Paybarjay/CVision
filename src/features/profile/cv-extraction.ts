import { z } from "zod";
import { ProfileSchema, type JobPreferences, type Profile } from "@/shared/contracts";

/**
 * What the model reads from a CV: a Profile without the id, the job preferences and the follow-up answers,
 * which a CV does not hold. profileFromExtraction() adds them back.
 */
export const CvExtractionSchema = ProfileSchema.omit({ id: true, preferences: true, followUpAnswers: true });
export type CvExtraction = z.infer<typeof CvExtractionSchema>;

/** Turns what was read from a CV into a tidy Profile, with empty preferences for the user to fill in later. */
export function profileFromExtraction(extraction: CvExtraction, id: string): Profile {
  const location = optional(extraction.contact.location);
  const preferences: JobPreferences = {
    salary: null,
    location: location ?? "",
    workModes: [],
    contractTypes: [],
    hours: [],
  };

  return ProfileSchema.parse({
    id,
    fullName: extraction.fullName.trim(),
    contact: {
      email: optional(extraction.contact.email),
      phone: optional(extraction.contact.phone),
      location,
      linkedIn: optional(extraction.contact.linkedIn),
    },
    summary: extraction.summary.trim(),
    skills: uniqueLines(extraction.skills),
    experience: extraction.experience.map((job) => ({
      ...job,
      title: job.title.trim(),
      company: job.company.trim(),
      location: optional(job.location),
      duties: uniqueLines(job.duties),
      achievements: uniqueLines(job.achievements),
    })),
    education: extraction.education.map((course) => ({
      ...course,
      institution: course.institution.trim(),
      qualification: course.qualification.trim(),
      subject: optional(course.subject),
      grade: optional(course.grade),
    })),
    certifications: extraction.certifications.map((certificate) => ({
      ...certificate,
      name: certificate.name.trim(),
      issuer: optional(certificate.issuer),
    })),
    preferences,
    followUpAnswers: [],
  });
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

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
