import "server-only";
import { getCurrentUser } from "@/features/account/current-user";
import { ApplicationSchema, JobSchema } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { TrackedApplication } from "./model";
import { sampleApplicationsOn } from "./sample";

export type Tracker =
  | { kind: "sample"; items: TrackedApplication[] }
  | { kind: "signed-out" }
  | { kind: "error" }
  | { kind: "account"; items: TrackedApplication[] };

// The dashboard needs only these fields, so a job with other gaps still shows. The closing date is optional.
const JobSummarySchema = JobSchema.pick({ title: true, company: true, deadline: true });

/**
 * The signed-in user's applications, newest first, each with its job's title, company and closing date.
 * Sara's sample applications, dated for `today`, while Supabase is not connected. Reads cookies, so call it
 * inside <Suspense>.
 */
export async function loadTracker(today: string): Promise<Tracker> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: "sample", items: sampleApplicationsOn(today) };

  const user = await getCurrentUser();
  if (!user) return { kind: "signed-out" };

  // Row-level security returns only this user's rows. Newest first, and edits do not reorder the list.
  const rows = await supabase.from("applications").select("id, data").order("created_at", { ascending: false });
  if (rows.error) return failed("read the tracker", rows.error.code);

  const applications = rows.data.flatMap((row) => {
    const parsed = ApplicationSchema.safeParse(row.data);
    if (!parsed.success) console.error("tracker: skipped an application that does not match the contract");
    return parsed.success ? [parsed.data] : [];
  });
  if (applications.length === 0) return { kind: "account", items: [] };

  const jobIds = [...new Set(applications.map((application) => application.jobId))];
  const jobs = await supabase.from("jobs").select("id, data").in("id", jobIds);
  if (jobs.error) return failed("read the jobs", jobs.error.code);

  const summaries = new Map(
    jobs.data.flatMap((row) => {
      const parsed = JobSummarySchema.safeParse(row.data);
      return parsed.success ? [[row.id as string, parsed.data] as const] : [];
    }),
  );
  return {
    kind: "account",
    items: applications.map((application) => ({ application, job: summaries.get(application.jobId) ?? null })),
  };
}

function failed(step: string, code: string | undefined): Tracker {
  // The step and the code only, as in actions.ts.
  console.error(`tracker: could not ${step} (${code ?? "unknown"})`);
  return { kind: "error" };
}
