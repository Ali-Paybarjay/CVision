import { z } from "zod";
import {
  ContractTypeSchema,
  DateTimeSchema,
  HoursSchema,
  IdSchema,
  SalarySchema,
  WorkModeSchema,
  YearMonthSchema,
} from "./common";

/** One job in the user's work history. */
export const WorkExperienceSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  startDate: YearMonthSchema,
  /** null while the user still works there. */
  endDate: YearMonthSchema.nullable(),
  /** What the user did day to day, as their CV says it. */
  duties: z.array(z.string()),
  /** Results the user can point to, ideally with numbers. */
  achievements: z.array(z.string()),
});
export type WorkExperience = z.infer<typeof WorkExperienceSchema>;

export const EducationSchema = z.object({
  institution: z.string().min(1),
  qualification: z.string().min(1),
  subject: z.string().optional(),
  startDate: YearMonthSchema.optional(),
  endDate: YearMonthSchema.nullable().optional(),
  grade: z.string().optional(),
});
export type Education = z.infer<typeof EducationSchema>;

export const CertificationSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  year: z.number().int().optional(),
});
export type Certification = z.infer<typeof CertificationSchema>;

/** A language the user speaks. The level is the one their CV gives ("Native", "Fluent", "B2"), never a guess. */
export const LanguageSchema = z.object({
  name: z.string().min(1),
  level: z.string().min(1).optional(),
});
export type Language = z.infer<typeof LanguageSchema>;

/** Something the user built or led outside a job: a course, personal or open-source project. */
export const ProjectSchema = z.object({
  name: z.string().min(1),
  /** Where it was done, if anywhere: a course, a university, an organisation. */
  organisation: z.string().optional(),
  startDate: YearMonthSchema.optional(),
  endDate: YearMonthSchema.nullable().optional(),
  /** What the user did and what came of it, as their CV says it. */
  details: z.array(z.string()),
  url: z.url().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Unpaid work. CVs often give no dates for it, so they are optional, unlike a job's. */
export const VolunteeringSchema = z.object({
  role: z.string().min(1),
  organisation: z.string().min(1),
  location: z.string().optional(),
  startDate: YearMonthSchema.optional(),
  /** null while the user still does it. */
  endDate: YearMonthSchema.nullable().optional(),
  /** What the user did, as their CV says it. */
  details: z.array(z.string()),
});
export type Volunteering = z.infer<typeof VolunteeringSchema>;

/** What kind of work the user is looking for. */
export const JobPreferencesSchema = z.object({
  salary: SalarySchema.nullable(),
  /** A city or a postcode. */
  location: z.string(),
  workModes: z.array(WorkModeSchema),
  contractTypes: z.array(ContractTypeSchema),
  hours: z.array(HoursSchema),
  /** Must-haves and deal-breakers the options don't cover, one per line, as the user wrote them. Not evidence for the CV. */
  notes: z.string().max(500).optional(),
});
export type JobPreferences = z.infer<typeof JobPreferencesSchema>;

/**
 * A follow-up question and the user's answer, kept word for word.
 * These answers are the evidence for any new claim in a tailored CV (Nothing invented, Sounds like you).
 */
export const FollowUpAnswerSchema = z.object({
  id: IdSchema,
  question: z.string().min(1),
  answer: z.string().min(1),
  answeredAt: DateTimeSchema,
});
export type FollowUpAnswer = z.infer<typeof FollowUpAnswerSchema>;

/** The user's CV turned into data (Shayan builds it; everyone reads it). */
export const ProfileSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1),
  /** Contact lines printed at the top of the CV. */
  contact: z.object({
    email: z.email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedIn: z.url().optional(),
  }),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(WorkExperienceSchema),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
  /**
   * Issue #226. Optional, so profiles saved before them stay valid. Shayan's profile writes them (from the CV and the
   * Profile page); Nazanin's tailored CV reads them. Each is the user's own evidence, like experience.
   */
  languages: z.array(LanguageSchema).optional(),
  projects: z.array(ProjectSchema).optional(),
  volunteering: z.array(VolunteeringSchema).optional(),
  preferences: JobPreferencesSchema,
  followUpAnswers: z.array(FollowUpAnswerSchema),
});
export type Profile = z.infer<typeof ProfileSchema>;
