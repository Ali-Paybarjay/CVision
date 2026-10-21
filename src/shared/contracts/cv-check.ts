import { z } from "zod";
import { IdSchema } from "./common";

export const CvIssueSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  /** What is wrong and why a UK employer cares. */
  explanation: z.string().min(1),
  /** One concrete way to fix it. */
  fix: z.string().min(1),
  severity: z.enum(["high", "medium", "low"]),
});
export type CvIssue = z.infer<typeof CvIssueSchema>;

/**
 * The free 2-minute CV check (Marzieh builds it).
 * Anonymous and never stored, so it has no id and no database table.
 */
export const CvCheckResultSchema = z.object({
  readiness: z.enum(["ready", "nearly-ready", "not-ready"]),
  /** 0 to 100, for the before-and-after story. */
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1),
  issues: z.array(CvIssueSchema),
});
export type CvCheckResult = z.infer<typeof CvCheckResultSchema>;
