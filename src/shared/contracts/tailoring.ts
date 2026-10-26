import { z } from "zod";
import { DateTimeSchema, IdSchema } from "./common";
import { ProfileSchema } from "./profile";

export const TailoringStatusSchema = z.enum(["proposed", "approved", "rejected"]);
export type TailoringStatus = z.infer<typeof TailoringStatusSchema>;

/**
 * One suggested edit to the CV for one job (Nazanin builds it).
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
  /**
   * A short note on which word in `after` goes further than the user's own words. Written by Tailor's code, never by
   * the model. Missing when nothing does.
   */
  stretch: z.string().min(1).optional(),
});
export type TailoringChange = z.infer<typeof TailoringChangeSchema>;

/** What the user approved for one job, saved when they download it or press Apply. */
export const TailoredCvSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  /** The user's Profile with only the approved changes applied. */
  cv: ProfileSchema,
  /** The approved changes behind it, with their evidence. */
  changes: z.array(TailoringChangeSchema),
  /** The approved cover letter as plain text; null if the user has not approved one. */
  coverLetter: z.string().min(1).nullable(),
  savedAt: DateTimeSchema,
});
export type TailoredCv = z.infer<typeof TailoredCvSchema>;
