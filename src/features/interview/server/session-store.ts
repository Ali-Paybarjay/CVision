import "server-only";
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
