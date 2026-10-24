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
