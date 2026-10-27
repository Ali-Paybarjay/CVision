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
});
export type Job = z.infer<typeof JobSchema>;
