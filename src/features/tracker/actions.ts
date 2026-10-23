"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { ApplicationSchema, type Application } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type RecordApplicationResult =
  | { ok: true; application: Application; created: boolean }
  | { ok: false; reason: "signed-out" | "not-connected" | "sample-job" | "job-not-found" | "failed"; message: string };

const JobIdSchema = z.string().min(1).max(100);

// Jobs saved in the jobs table have a uuid; sample jobs ("sara-job-1") have no row, so they cannot be tracked.
const StoredJobIdSchema = z.uuid();

/**
 * Adds the job to the signed-in user's tracker when they press Apply (Nazanin's button, #52), with status
 * "applied" and today's date. Pressing Apply again adds nothing: the existing application comes back, and one
 * still marked "ready" moves to "applied". The app never applies on the user's behalf; this only records it.
 */
export async function recordApplication(jobId: unknown): Promise<RecordApplicationResult> {
  // Anything can be posted to an action, so the id is checked before use.
  const parsed = JobIdSchema.safeParse(jobId);
  if (!parsed.success) return notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: "not-connected", message: "Your tracker is not switched on yet, so this application was not saved." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed-out", message: "Sign in to keep track of this application." };
  if (!StoredJobIdSchema.safeParse(parsed.data).success) {
    return { ok: false, reason: "sample-job", message: "This is a sample job, so it is not added to your tracker." };
  }

  // Row-level security only checks user_id, so a job id from another account must be refused here (issue #28).
  const job = await supabase.from("jobs").select("id").eq("id", parsed.data).maybeSingle();
  if (job.error) return failed("read the job", job.error.code);
  if (!job.data) return notFound();

  const existing = await supabase
    .from("applications")
    .select("id, data")
    .eq("job_id", parsed.data)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) return failed("read the tracker", existing.error.code);

  if (existing.data) {
    const saved = ApplicationSchema.safeParse(existing.data.data);
    if (!saved.success) return failed("read the tracker", "invalid-data");
    if (saved.data.status !== "ready") return { ok: true, application: saved.data, created: false };

    const application: Application = { ...saved.data, status: "applied", date: londonToday() };
    const { error } = await supabase.from("applications").update({ data: application }).eq("id", existing.data.id);
    if (error) return failed("update the tracker", error.code);
    revalidatePath("/dashboard");
    return { ok: true, application, created: false };
  }

  const application: Application = { id: randomUUID(), jobId: parsed.data, date: londonToday(), status: "applied", nextStep: null };
  const { error } = await supabase.from("applications").insert({ id: application.id, job_id: application.jobId, data: application });
  if (error) return failed("add to the tracker", error.code);
  revalidatePath("/dashboard");
  return { ok: true, application, created: true };
}

/** Today's date in the UK, so an application made just after midnight in summer is not dated the day before. */
function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function notFound(): RecordApplicationResult {
  return { ok: false, reason: "job-not-found", message: "We could not find this job in your account, so it was not added to your tracker." };
}

function failed(step: string, code: string | undefined): RecordApplicationResult {
  // The step and the code only: never the job or anything the user wrote.
  console.error(`tracker: could not ${step} (${code ?? "unknown"})`);
  return { ok: false, reason: "failed", message: "We could not add this job to your tracker. Try again in a moment." };
}
