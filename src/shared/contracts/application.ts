import { z } from "zod";
import { DateSchema, IdSchema } from "./common";

/**
 * Where an application stands. "accepted", "rejected", "no_response" and "withdrawn" close it; "withdrawn" also
 * covers an offer the user turned down.
 */
export const ApplicationStatusSchema = z.enum([
  "ready",
  "applied",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "no_response",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/** A message the user says they sent about an application. The app only drafts it; the user always sends it. */
export const ApplicationFollowUpSchema = z.object({
  /** "follow-up": a polite chaser after applying. "thank-you": a note after an interview. */
  kind: z.enum(["follow-up", "thank-you"]),
  /** The day the user sent it. */
  date: DateSchema,
});
export type ApplicationFollowUp = z.infer<typeof ApplicationFollowUpSchema>;

/** One job the user is applying for, as shown in the tracker (Nazanin creates it on Apply; Ali shows it). */
export const ApplicationSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  /** The day the application was created or last changed status. */
  date: DateSchema,
  status: ApplicationStatusSchema,
  /** What the user plans to do next, e.g. "Follow up by email on Friday". */
  nextStep: z.string().nullable(),
  /**
   * The day the user plans to take the next step. Only the dashboard writes it, and only beside a next step: clearing
   * the next step clears it. Missing or null: no date (Apply creates applications without it).
   */
  nextStepDate: DateSchema.nullable().optional(),
  /** The follow-ups the user has sent. Missing on applications saved before this field. */
  followUps: z.array(ApplicationFollowUpSchema).optional(),
});
export type Application = z.infer<typeof ApplicationSchema>;
