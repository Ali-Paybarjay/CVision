import { z } from "zod";
import { DateSchema, IdSchema } from "./common";

export const ApplicationStatusSchema = z.enum(["ready", "applied", "interview", "offer", "rejected"]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/** One job the user is applying for, as shown in the tracker (Nazanin creates it on Apply; Ali shows it). */
export const ApplicationSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  /** The day the application was created or last changed status. */
  date: DateSchema,
  status: ApplicationStatusSchema,
  /** What the user plans to do next, e.g. "Follow up by email on Friday". */
  nextStep: z.string().nullable(),
});
export type Application = z.infer<typeof ApplicationSchema>;
