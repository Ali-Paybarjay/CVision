import "server-only";
import { getCurrentUser } from "@/features/account/current-user";
import { listPracticeSummaries } from "@/features/interview/server/session-store";
import { getMyProfile, listMyJobs } from "@/features/profile/my-data";
import { ApplicationSchema, JobSchema, type Job } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { JobInProgress, TrackedApplication } from "./model";
import { sampleApplicationsOn } from "./sample";

export type Tracker =
  | { kind: "sample"; items: TrackedApplication[] }
  | { kind: "signed-out" }
  | { kind: "error" }
  | { kind: "account"; items: TrackedApplication[]; hasProfile: boolean; inProgress: JobInProgress[] };

// The dashboard needs only these fields, so a job with other gaps still shows. The closing date is optional.
const JobSummarySchema = JobSchema.pick({ title: true, company: true, deadline: true });

/** The most jobs in progress the dashboard lists. "See all your jobs" leads to the rest, on Tailor. */
const maxJobsInProgress = 5;

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/**
 * The signed-in user's applications, newest first, each with its job's title, company and closing date. Beside them,
 * for the next step (#506): whether the user has a profile, and their newest jobs with no application yet, five at most.
 * Sara's sample applications, dated for `today`, while Supabase is not connected. Reads cookies, so call it
 * inside <Suspense>.
 */
export async function loadTracker(today: string): Promise<Tracker> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: "sample", items: sampleApplicationsOn(today) };

  const user = await getCurrentUser();
  if (!user) return { kind: "signed-out" };

  // Row-level security returns only this user's rows. Newest first, and edits do not reorder the list. The profile and
  // the jobs are the ones Tailor reads, so the dashboard asks for a profile exactly when Tailor does.
  const [rows, profile, myJobs] = await Promise.all([
    supabase.from("applications").select("id, data").order("created_at", { ascending: false }),
    getMyProfile(),
    listMyJobs(),
  ]);
  if (rows.error) return failed("read the tracker", rows.error.code);

  const applications = rows.data.flatMap((row) => {
    const parsed = ApplicationSchema.safeParse(row.data);
    if (!parsed.success) console.error("tracker: skipped an application that does not match the contract");
    return parsed.success ? [parsed.data] : [];
  });
  const jobIds = [...new Set(applications.map((application) => application.jobId))];
  // The jobs checked but not applied for yet, newest first, as listMyJobs gives them.
  const waiting = myJobs.filter((job) => !jobIds.includes(job.id)).slice(0, maxJobsInProgress);
  const waitingIds = waiting.map((job) => job.id);
  const hasProfile = profile !== null;
  if (applications.length === 0) {
    const withSavedCv = await jobsWithSavedCv(supabase, waitingIds);
    return { kind: "account", items: [], hasProfile, inProgress: listInProgress(waiting, withSavedCv) };
  }

  // The latest finished practice for each job. It reads as empty on any error, so a row then just has no report link.
  const [jobs, practices, withSavedCv] = await Promise.all([
    supabase.from("jobs").select("id, data").in("id", jobIds),
    listPracticeSummaries(),
    jobsWithSavedCv(supabase, [...jobIds, ...waitingIds]),
  ]);
  if (jobs.error) return failed("read the jobs", jobs.error.code);
  const reports = new Map(practices.map((practice) => [practice.jobId, { overall: practice.overall }]));

  const summaries = new Map(
    jobs.data.flatMap((row) => {
      const parsed = JobSummarySchema.safeParse(row.data);
      // The ad page reads the job with getMyJob, which needs the whole contract, so only then is there a link.
      const hasAd = JobSchema.safeParse(row.data).success;
      return parsed.success ? [[row.id as string, { job: parsed.data, hasAd }] as const] : [];
    }),
  );
  return {
    kind: "account",
    items: applications.map((application) => {
      const summary = summaries.get(application.jobId);
      const report = reports.get(application.jobId);
      const hasCv = withSavedCv.has(application.jobId);
      return { application, job: summary?.job ?? null, hasAd: summary?.hasAd ?? false, ...(report && { report }), ...(hasCv && { hasCv }) };
    }),
    hasProfile,
    inProgress: listInProgress(waiting, withSavedCv),
  };
}

/**
 * Which of these jobs have a saved CV and cover letter (#207): only that, never the CV itself. It reads as empty on any
 * error, so a job then just has no link to it.
 */
async function jobsWithSavedCv(supabase: Supabase, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const savedCvs = await supabase.from("tailored_cvs").select("job_id").in("job_id", jobIds);
  if (savedCvs.error) console.error(`tracker: could not read the saved CVs (${savedCvs.error.code ?? "unknown"})`);
  return new Set((savedCvs.data ?? []).map((row) => row.job_id as string));
}

/** Each job in progress as the dashboard lists it: its name, and whether a CV is saved for it. */
function listInProgress(jobs: Job[], withSavedCv: Set<string>): JobInProgress[] {
  return jobs.map(({ id, title, company }) => ({ id, title, company, hasCv: withSavedCv.has(id) }));
}

function failed(step: string, code: string | undefined): Tracker {
  // The step and the code only, as in actions.ts.
  console.error(`tracker: could not ${step} (${code ?? "unknown"})`);
  return { kind: "error" };
}
