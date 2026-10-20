import { z } from "zod";
import { IdSchema } from "./common";

export const TailoringStatusSchema = z.enum(["proposed", "approved", "rejected"]);
export type TailoringStatus = z.infer<typeof TailoringStatusSchema>;

/**
 * One suggested edit to the CV for one job (person 3 builds it).
 * Only "approved" changes reach the exported CV (You approve everything).
 */
export const TailoringChangeSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  /** The gap this change answers, if any. */
  gapId: IdSchema.optional(),
  section: z.enum(["summary", "skills", "experience", "education", "certifications"]),
  /** The current line; null when the change adds a new line. */
  before: z.string().nullable(),
  /** The suggested line, built from the user's own words where possible (Sounds like you). */
  after: z.string().min(1),
  /**
   * What the user said that supports the change, in their own words.
   * Never empty: a change without evidence is not allowed (Nothing invented).
   */
  evidence: z.string().min(1),
  evidenceSource: z.enum(["cv", "follow-up-answer"]),
  status: TailoringStatusSchema,
});
export type TailoringChange = z.infer<typeof TailoringChangeSchema>;
