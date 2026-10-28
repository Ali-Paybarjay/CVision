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
  preferences: JobPreferencesSchema,
  followUpAnswers: z.array(FollowUpAnswerSchema),
});
export type Profile = z.infer<typeof ProfileSchema>;
