import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { InterviewSessionSchema, type InterviewSession } from "../contracts";
import { endedOverall, nextStep } from "../engine/session";

// Practice sessions in the interview_sessions table. The client acts as the signed-in user, so row-level
// security keeps every user to their own rows. Callers check the job is the user's own first (issue #28).

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a job saved in the jobs table. Sample jobs ("sara-job-1") have no row, so their sessions are not saved. */
export function isStoredJobId(jobId: string): boolean {
  return uuidPattern.test(jobId);
}

export type SaveResult = { saved: true } | { saved: false; reason: "sample-job" | "not-connected" | "failed" };

/** Adds or updates one session for the signed-in user. */
export async function saveInterviewSession(session: InterviewSession): Promise<SaveResult> {
  if (!isStoredJobId(session.jobId) || !uuidPattern.test(session.id)) return { saved: false, reason: "sample-job" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { saved: false, reason: "not-connected" };

  const { error } = await supabase
    .from("interview_sessions")
    .upsert({ id: session.id, job_id: session.jobId, data: session }, { onConflict: "id" });
  if (error) {
    // The code only: the row holds the user's answers.
    console.error(`interview: could not save a session (${error.code})`);
    return { saved: false, reason: "failed" };
  }
  return { saved: true };
}

/** The signed-in user's most recently updated session for a job, or null. */
export async function loadLatestInterviewSession(jobId: string): Promise<InterviewSession | null> {
  if (!isStoredJobId(jobId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("interview_sessions")
    .select("data")
    .eq("job_id", jobId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = InterviewSessionSchema.safeParse(data.data);
  return parsed.success ? parsed.data : null;
}

/** The signed-in user's latest finished practice for a job, and when it was last saved. */
export type LastReport = { session: InterviewSession; practisedAt: string };

/** Nothing is left to do: the report is written, or after "End here" (#205) every question is scored or has a suggested answer. */
const isFinished = (session: InterviewSession) => nextStep(session).step === "done";

const newestFirst = (a: { practisedAt: string }, b: { practisedAt: string }) => Date.parse(b.practisedAt) - Date.parse(a.practisedAt);

/**
 * The latest finished session for a job (with a report, or ended with "End here"), or null. A newer unfinished
 * practice does not hide it (#206), and nor does an ended one still writing its suggested answers.
 */
export async function loadLatestReport(jobId: string): Promise<LastReport | null> {
  if (!isStoredJobId(jobId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  // One query per kind of finished session; an ended one may not be finished yet, so a few of those.
  const newest = (finishedBy: string, count: number) =>
    supabase
      .from("interview_sessions")
      .select("data, updated_at")
      .eq("job_id", jobId)
      .not(finishedBy, "is", null)
      .order("updated_at", { ascending: false })
      .limit(count);
  const results = await Promise.all([newest("data->report", 1), newest("data->endedAt", 3)]);
  if (results.some(({ data, error }) => error || !data)) return null;
  const finished = results
    .flatMap(({ data }) => data ?? [])
    .flatMap((row) => {
      const parsed = InterviewSessionSchema.safeParse(row.data);
      return parsed.success && isFinished(parsed.data) ? [{ session: parsed.data, practisedAt: row.updated_at as string }] : [];
    });
  return finished.sort(newestFirst)[0] ?? null;
}

/** One job's latest finished practice: when, and its overall score out of 5, or null after "End here" with no answer. */
export type PracticeResult = { jobId: string; practisedAt: string; overall: number | null };

/** The same for a practice with a score. */
export type PracticeSummary = { jobId: string; practisedAt: string; overall: number };

const ReportRowSchema = z.object({ job_id: z.string(), updated_at: z.string(), overall: z.number().min(1).max(5) });
const EndedRowSchema = z.object({ job_id: z.string(), updated_at: z.string(), data: InterviewSessionSchema });

/**
 * The latest finished practice of each of the signed-in user's jobs, newest first, for the job list. A report row
 * gives only the job, the date and the score, never the answers. After "End here" the score is the average of the
 * answered questions (endedOverall, as the report shows it), so those rows need the whole session.
 */
export async function listPracticeResults(): Promise<PracticeResult[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const [reported, ended] = await Promise.all([
    supabase
      .from("interview_sessions")
      .select("job_id, updated_at, overall:data->report->overall")
      .not("data->report", "is", null)
      .order("updated_at", { ascending: false }),
    supabase.from("interview_sessions").select("job_id, updated_at, data").not("data->endedAt", "is", null).order("updated_at", { ascending: false }),
  ]);
  if (reported.error || ended.error || !reported.data || !ended.data) return [];
  const results: PracticeResult[] = [
    ...reported.data.flatMap((row) => {
      const parsed = ReportRowSchema.safeParse(row);
      return parsed.success ? [{ jobId: parsed.data.job_id, practisedAt: parsed.data.updated_at, overall: parsed.data.overall }] : [];
    }),
    ...ended.data.flatMap((row) => {
      const parsed = EndedRowSchema.safeParse(row);
      if (!parsed.success || !isFinished(parsed.data.data)) return [];
      return [{ jobId: parsed.data.job_id, practisedAt: parsed.data.updated_at, overall: endedOverall(parsed.data.data) }];
    }),
  ];
  const latest = new Map<string, PracticeResult>();
  for (const result of results.sort(newestFirst)) if (!latest.has(result.jobId)) latest.set(result.jobId, result);
  return [...latest.values()];
}

/**
 * The same with a score, for the dashboard (#208). A job whose latest practice ended with no answer has no entry,
 * rather than an older score than the practice the link opens.
 */
export async function listPracticeSummaries(): Promise<PracticeSummary[]> {
  return (await listPracticeResults()).flatMap(({ overall, ...result }) => (overall === null ? [] : [{ ...result, overall }]));
}
