import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { TailoringChangeSchema, type TailoringChange } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * The decisions the signed-in user already made for one job (from tailoring_changes), so they are still there
 * after a reload. Empty for sample jobs, signed-out visitors, or when Supabase isn't connected.
 * Row-level security limits the rows to the user's own; each row is checked against its contract.
 */
export async function getMySavedChanges(jobId: string): Promise<TailoringChange[]> {
  if (!z.uuid().safeParse(jobId).success) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await getCurrentUser())) return [];

  const { data, error } = await supabase.from("tailoring_changes").select("data").eq("job_id", jobId).order("created_at");
  if (error) {
    // The code only: never the change text.
    console.error(`tailor: could not read the saved changes (${error.code ?? "unknown"})`);
    return [];
  }
  return (data ?? []).flatMap((row: { data: unknown }) => {
    const parsed = TailoringChangeSchema.safeParse(row.data);
    return parsed.success && parsed.data.jobId === jobId ? [parsed.data] : [];
  });
}
