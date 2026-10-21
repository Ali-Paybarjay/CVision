import { z } from "zod";
import { IdSchema } from "./common";

/** A requirement the user already meets, and where that is shown in their Profile. */
export const StrengthSchema = z.object({
  requirement: z.string().min(1),
  /** The CV line or follow-up answer that proves it. */
  evidence: z.string().min(1),
});
export type Strength = z.infer<typeof StrengthSchema>;

/** Something to ask the user about before tailoring (Nazanin asks one question per gap). */
export const GapSchema = z.object({
  id: IdSchema,
  requirement: z.string().min(1),
  importance: z.enum(["essential", "desirable"]),
  /** Why it is a gap: missing from the CV, or present but vague (no numbers, no example). */
  kind: z.enum(["missing", "unclear"]),
  detail: z.string(),
});
export type Gap = z.infer<typeof GapSchema>;

/** How well a Profile fits a Job (Shayan builds it). */
export const MatchResultSchema = z.object({
  jobId: IdSchema,
  /** 0 to 100. */
  score: z.number().int().min(0).max(100),
  strengths: z.array(StrengthSchema),
  /** Requirements from the ad with no evidence at all in the Profile. */
  uncoveredRequirements: z.array(z.string()),
  gaps: z.array(GapSchema),
  /** A short, plain explanation of the score. */
  reasoning: z.string().min(1),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
