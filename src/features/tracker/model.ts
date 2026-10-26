// What the tracker shares between the server and the dashboard's browser code: status words, the change a
// user can make, and dates. No server-only imports, so the client rows can use it in sample mode too.
import { z } from "zod";
import { ApplicationStatusSchema, type Application, type ApplicationStatus } from "@/shared/contracts";

/** One row on the dashboard: the application and the job it is for (null when the job cannot be read). */
export type TrackedApplication = { application: Application; job: { title: string; company: string } | null };

export type UpdateApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; reason: "signed-out" | "not-connected" | "invalid" | "not-found" | "failed"; message: string };

export const statusLabels: Record<ApplicationStatus, string> = {
  ready: "Ready to apply",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Unsuccessful",
  no_response: "No response",
  withdrawn: "Withdrawn",
};

/** The words before the date under each job, e.g. "Applied on 22 Oct 2026". */
export const statusDateLabels: Record<ApplicationStatus, string> = {
  ready: "Ready to apply since",
  applied: "Applied on",
  interview: "Interview stage since",
  offer: "Offer received on",
  accepted: "Accepted on",
  rejected: "Closed on",
  no_response: "Closed on",
  withdrawn: "Withdrawn on",
};

export const nextStepMaxLength = 200;

/** What the user can change on a row. An empty next step is saved as null. */
export const ApplicationChangeSchema = z.object({
  status: ApplicationStatusSchema,
  nextStep: z
    .string()
    .trim()
    .max(nextStepMaxLength)
    .transform((text) => text || null),
});
export type ApplicationChange = z.infer<typeof ApplicationChangeSchema>;

/** The application after the change. The date moves only when the status does, as the contract says. */
export function applyChange(saved: Application, change: ApplicationChange, today: string): Application {
  const statusChanged = change.status !== saved.status;
  return { ...saved, status: change.status, nextStep: change.nextStep, date: statusChanged ? today : saved.date };
}

/** Today's date in the UK, so a change made just after midnight in summer is not dated the day before. */
export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "22 Oct 2026" for "2026-10-22". Read as UTC, so no time zone can move it a day. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}
