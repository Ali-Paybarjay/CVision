import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { InterviewSessionSchema, type InterviewSession } from "../contracts";

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

/** The signed-in user's latest finished practice for a job (one with a report), and when it was last saved. */
export type LastReport = { session: InterviewSession; practisedAt: string };

/** The latest session for a job that has a report, or null. A newer unfinished practice does not hide it (#206). */
export async function loadLatestReport(jobId: string): Promise<LastReport | null> {
  if (!isStoredJobId(jobId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("interview_sessions")
    .select("data, updated_at")
    .eq("job_id", jobId)
    .not("data->report", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = InterviewSessionSchema.safeParse(data.data);
  return parsed.success && parsed.data.report ? { session: parsed.data, practisedAt: data.updated_at } : null;
}

/** One job's latest finished practice: when, and its overall score out of 5. */
export type PracticeSummary = { jobId: string; practisedAt: string; overall: number };

const SummaryRowSchema = z.object({ job_id: z.string(), updated_at: z.string(), overall: z.number().min(1).max(5) });

/**
 * The latest finished practice of each of the signed-in user's jobs, newest first. Reads only the job, the date and
 * the score, never the answers, so the job list (and the dashboard, #208) can show them cheaply.
 */
export async function listPracticeSummaries(): Promise<PracticeSummary[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("interview_sessions")
    .select("job_id, updated_at, overall:data->report->overall")
    .not("data->report", "is", null)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const latest = new Map<string, PracticeSummary>();
  for (const row of data) {
    const parsed = SummaryRowSchema.safeParse(row);
    if (!parsed.success || latest.has(parsed.data.job_id)) continue;
    latest.set(parsed.data.job_id, { jobId: parsed.data.job_id, practisedAt: parsed.data.updated_at, overall: parsed.data.overall });
  }
  return [...latest.values()];
}
