import { z } from "zod";
import { ContractTypeSchema, DateSchema, HoursSchema, IdSchema, SalarySchema, WorkModeSchema } from "./common";

/** Where a job ad came from. Phase 1 has only "pasted"; phase 2 adds the job APIs. */
export const JobSourceSchema = z.enum(["pasted", "reed", "adzuna"]);
export type JobSource = z.infer<typeof JobSourceSchema>;

/** What the ad itself says about who can be hired. Read from the ad only, never from the user. */
export const JobEligibilitySchema = z.object({
  /** "offered": the ad says it can sponsor a visa. "not-offered": it says it cannot. "not-stated": it says neither. */
  sponsorship: z.enum(["offered", "not-offered", "not-stated"]),
  /** True only when the ad says the post is for UK nationals only (for example a reserved Civil Service post). */
  ukNationalsOnly: z.boolean(),
  /** Security vetting the ad names. BPSS is a standard pre-employment check, not a nationality rule. */
  securityVetting: z.enum(["bpss", "ctc", "sc", "dv"]).nullable(),
  /** The ad's own sentences about who can apply, word for word. */
  quotes: z.array(z.string().min(1)),
});
export type JobEligibility = z.infer<typeof JobEligibilitySchema>;

/**
 * What kind of role the ad describes, read from the ad only (#398). Each part is empty when the ad does not say.
 * Written by profile-job (Shayan's job reader); read by Tailor (#404), and later Interview and Supporting information.
 */
export const JobRoleSchema = z.object({
  /** The profession, e.g. "Nursing", "Software engineering", "Management accounting". */
  discipline: z.string(),
  /** The specialty or setting, e.g. "Neonatal intensive care", "Front-end web". */
  specialty: z.string(),
  /** The level in the ad's own words, e.g. "Band 6", "Senior", "Graduate". */
  level: z.string(),
  /** The registration or licensing body the ad requires, e.g. "NMC", "GMC", "HCPC". */
  registration: z.string(),
});
export type JobRole = z.infer<typeof JobRoleSchema>;

/**
 * What kind of condition a requirement is (#222). "credential": a licence or card, such as a driving licence or a CSCS
 * card. "working": a working condition, such as travel, night shifts or an own car. "sensitive": something the app
 * never asks about or stores, such as right to work, a DBS check or lifting heavy loads.
 */
export const JobConditionKindSchema = z.enum(["credential", "working", "sensitive"]);
export type JobConditionKind = z.infer<typeof JobConditionKindSchema>;

/**
 * One of the job's requirements that is a condition of the job rather than a skill or experience (#222). The match
 * leaves it out of the score and shows it apart. Professional registrations, degrees and specialist certificates are
 * never conditions: the CV shows them.
 */
export const JobConditionSchema = z.object({
  /** One of `requirements.essential` or `requirements.desirable`, word for word. */
  requirement: z.string().min(1),
  kind: JobConditionKindSchema,
});
export type JobCondition = z.infer<typeof JobConditionSchema>;

/** A job ad turned into data (Shayan builds it from the pasted text). */
export const JobSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  company: z.string().min(1),
  /** A city, a region or "Remote (UK)". */
  location: z.string(),
  /** null when the ad does not say. */
  salary: SalarySchema.nullable(),
  contractType: ContractTypeSchema.nullable(),
  hours: HoursSchema.nullable(),
  workMode: WorkModeSchema.nullable(),
  /** The full ad text, as pasted. */
  description: z.string().min(1),
  requirements: z.object({
    essential: z.array(z.string()),
    desirable: z.array(z.string()),
  }),
  /** The employer's official link. Apply always opens this; the app never applies itself. */
  url: z.url().nullable(),
  source: JobSourceSchema,
  /**
   * The closing date the ad gives. null when the ad gives none or says "ASAP". Missing when the ad was read before
   * this field existed, so the deadline is unknown: never guess it.
   */
  deadline: DateSchema.nullable().optional(),
  /** What the ad says about visa sponsorship, UK nationals only and security vetting. Missing on ads read before it. */
  eligibility: JobEligibilitySchema.optional(),
  /** What kind of role the ad describes. Missing on jobs read before this field existed, or when the ad says nothing. */
  role: JobRoleSchema.optional(),
  /**
   * The requirements that are conditions of the job (#222): licences and cards, working conditions and sensitive ones.
   * Written by profile-job (Shayan's job reader); read by the match and /jobs, and later Tailor. An empty list: the ad
   * has none. Missing on jobs read before this field existed.
   */
  conditions: z.array(JobConditionSchema).optional(),
});
export type Job = z.infer<typeof JobSchema>;
