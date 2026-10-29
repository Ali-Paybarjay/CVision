// What the tracker shares between the server and the dashboard's browser code: status words, the change a
// user can make, and dates. No server-only imports, so the client rows can use it in sample mode too.
import { z } from "zod";
import { ApplicationStatusSchema, type Application, type ApplicationStatus, type Job } from "@/shared/contracts";

/** What the dashboard shows of a job: its name and, when the ad gives one, its closing date. */
export type JobSummary = Pick<Job, "title" | "company" | "deadline">;

/**
 * One row on the dashboard: the application and the job it is for (null when the job cannot be read). `hasAd` is
 * true when the job's full ad can be opened on its own page (jobAdPath): a saved job, or one of the sample jobs.
 */
export type TrackedApplication = { application: Application; job: JobSummary | null; hasAd?: boolean };

/** The page that shows a job's full ad as the user pasted it. The ad itself never comes to the dashboard. */
export function jobAdPath(jobId: string): string {
  return `/dashboard/jobs/${encodeURIComponent(jobId)}`;
}

export type UpdateApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; reason: "signed-out" | "not-connected" | "invalid" | "not-found" | "failed"; message: string };

export type CloseWithoutNewsResult =
  | { ok: true; closed: Application[] }
  | { ok: false; reason: "signed-out" | "not-connected" | "invalid" | "failed"; message: string };

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

/** Statuses that end an application. They are listed apart, under Closed, and never count days. */
const closedStatuses: readonly ApplicationStatus[] = ["accepted", "rejected", "no_response", "withdrawn"];

/** Statuses that wait on the employer. Not "ready": nothing has been sent yet. Not "offer": the user answers next. */
const waitingStatuses: readonly ApplicationStatus[] = ["applied", "interview"];

/** After this many days without news, the dashboard suggests closing an application as No response. */
export const noNewsDays = 60;

/** A ready application warns when this many days or fewer are left before the job's closing date. */
export const closingSoonDays = 7;

export function isClosed(status: ApplicationStatus): boolean {
  return closedStatuses.includes(status);
}

/** Open applications and closed ones apart, each in the order it came. The dashboard lists closed ones under their own heading below. */
export function openAndClosed(items: TrackedApplication[]): { open: TrackedApplication[]; closed: TrackedApplication[] } {
  return {
    open: items.filter((item) => !isClosed(item.application.status)),
    closed: items.filter((item) => isClosed(item.application.status)),
  };
}

/**
 * Days since an applied or interview application last moved, counted from its date to today. Null for every
 * other status: a ready one has not been sent and a closed one waits for nothing. Worked out on each render,
 * never saved.
 */
export function daysWithoutNews(application: Application, today: string): number | null {
  if (!waitingStatuses.includes(application.status)) return null;
  return Math.max(0, daysBetween(application.date, today));
}

/** True for an applied or interview application with no news for 60 days or more. Never for ready or closed ones. */
export function canCloseWithoutNews(application: Application, today: string): boolean {
  const days = daysWithoutNews(application, today);
  return days !== null && days >= noNewsDays;
}

/** The rows the dashboard suggests closing as No response. Only a suggestion: nothing is written until the user picks. */
export function suggestClosing(items: TrackedApplication[], today: string): TrackedApplication[] {
  return items.filter((item) => canCloseWithoutNews(item.application, today));
}

/**
 * The ticked applications closed as No response today, with the server's rule: a row that was not ticked is never
 * closed, and a ticked one that is ready, closed or has had news within 60 days is left out. The sample uses it.
 */
export function closeChosen(items: readonly TrackedApplication[], ids: readonly string[], today: string): Application[] {
  return items
    .filter(({ application }) => ids.includes(application.id) && canCloseWithoutNews(application, today))
    .map(({ application }) => markNoResponse(application, today));
}

/** The application closed as No response today. Only the status and the date change; every other field stays. */
export function markNoResponse<T extends Pick<Application, "status" | "date">>(application: T, today: string): T {
  return { ...application, status: "no_response", date: today };
}

/**
 * The job's closing date and what to say with it. "date": the date alone, once the CV has been sent. For a ready
 * application, "open": more than 7 days left; "soon": 7 days or fewer; "passed": the date has gone.
 */
export type ClosingDate =
  | { deadline: string; alert: "date" | "open" | "passed" }
  | { deadline: string; alert: "soon"; daysLeft: number };

/**
 * What to say about the job's closing date, or null when the ad gave none. Only a ready application gets a
 * warning. The days left are worked out on each render, never saved.
 */
export function closingDate(application: Application, job: JobSummary | null, today: string): ClosingDate | null {
  const deadline = job?.deadline;
  if (!deadline) return null;
  if (application.status !== "ready") return { deadline, alert: "date" };

  // The closing date is the last day to apply, so 0 days left means it closes today.
  const daysLeft = daysBetween(today, deadline);
  if (daysLeft < 0) return { deadline, alert: "passed" };
  if (daysLeft <= closingSoonDays) return { deadline, alert: "soon", daysLeft };
  return { deadline, alert: "open" };
}

/**
 * Whole days from one calendar date to another, e.g. "2026-10-24" to "2026-10-26" is 2. Both are UK calendar
 * dates (see londonToday), so the day the clocks change counts as one day like any other.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** The calendar date this many days after the given one (before it, when negative). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Today's date in the UK, so a change made just after midnight in summer is not dated the day before. */
export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "22 Oct 2026" for "2026-10-22". Read as UTC, so no time zone can move it a day. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

/** "1 day" or "5 days". */
export function dayCount(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}
