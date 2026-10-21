import { z } from "zod";
import { ContractTypeSchema, HoursSchema, IdSchema, SalarySchema, WorkModeSchema } from "./common";

/** Where a job ad came from. Phase 1 has only "pasted"; phase 2 adds the job APIs. */
export const JobSourceSchema = z.enum(["pasted", "reed", "adzuna"]);
export type JobSource = z.infer<typeof JobSourceSchema>;

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
});
export type Job = z.infer<typeof JobSchema>;
