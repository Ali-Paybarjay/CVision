import "server-only";
import type { Job, MatchResult } from "@/shared/contracts";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

export type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/**
 * Saves a job and its match for the signed-in user. The row id is the Job's id, so /tailor?job=<id> finds it.
 * user_id is filled in by the database from the session, and row-level security keeps the rows private.
 * Returns false when either row could not be saved; a job is never left without its match.
 */
export async function saveJobAndMatch(supabase: SupabaseServerClient, job: Job, match: MatchResult): Promise<boolean> {
  const { error: jobError } = await supabase.from("jobs").insert({ id: job.id, data: job });
  if (jobError) {
    console.error("profile: could not save the job:", jobError.message);
    return false;
  }

  const { error: matchError } = await supabase.from("match_results").insert({ job_id: job.id, data: match });
  if (matchError) {
    console.error("profile: could not save the match:", matchError.message);
    await supabase.from("jobs").delete().eq("id", job.id);
    return false;
  }
  return true;
}

/** What became of a request to delete one of the user's jobs. */
export type DeleteJobOutcome = "deleted" | "on-dashboard" | "not-found" | "failed";

/**
 * Deletes one of the signed-in user's jobs, unless it is on their dashboard: a job they applied for keeps its
 * application (#462). The database deletes what was kept for the job with it (its match, tailoring, gap questions and
 * interview practice), and row-level security deletes only the user's own rows, so another account's job is
 * "not-found". Apply pressed in another tab between the two requests is the one way an application could still go.
 */
export async function deleteJob(supabase: SupabaseServerClient, jobId: string): Promise<DeleteJobOutcome> {
  const applications = await supabase.from("applications").select("id").eq("job_id", jobId).limit(1);
  if (applications.error) {
    console.error("profile: could not read the applications:", applications.error.message);
    return "failed";
  }
  if ((applications.data ?? []).length > 0) return "on-dashboard";

  const { data, error } = await supabase.from("jobs").delete().eq("id", jobId).select("id");
  if (error) {
    console.error("profile: could not delete the job:", error.message);
    return "failed";
  }
  return (data ?? []).length > 0 ? "deleted" : "not-found";
}
