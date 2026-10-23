"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { track } from "@/shared/analytics/track";
import { ApplicationSchema, type Application } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { ApplicationChangeSchema, applyChange, londonToday, type UpdateApplicationResult } from "./model";

export type RecordApplicationResult =
  | { ok: true; application: Application; created: boolean }
  | { ok: false; reason: "signed-out" | "not-connected" | "sample-job" | "job-not-found" | "failed"; message: string };

const JobIdSchema = z.string().min(1).max(100);

// Jobs saved in the jobs table have a uuid; sample jobs ("sara-job-1") have no row, so they cannot be tracked.
const StoredJobIdSchema = z.uuid();

// Applications saved in the applications table have a uuid too.
const StoredApplicationIdSchema = z.uuid();

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

  // The database refuses a job from another account too (issue #28); checking first gives the user a clear answer.
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
  // Apply pressed in another tab saved this job a moment earlier (one application per job): answer as for a second press.
  if (error?.code === "23505") return recordApplication(parsed.data);
  if (error) return failed("add to the tracker", error.code);
  revalidatePath("/dashboard");
  return { ok: true, application, created: true };
}

/**
 * Saves the status and next step the user chose on the dashboard. A new status also moves the date to today
 * and records tracker.status_changed; a new next step alone changes neither.
 */
export async function updateApplication(applicationId: unknown, change: unknown): Promise<UpdateApplicationResult> {
  const parsedChange = ApplicationChangeSchema.safeParse(change);
  if (!parsedChange.success) {
    return { ok: false, reason: "invalid", message: "Choose a status and keep the next step under 200 characters." };
  }
  const id = StoredApplicationIdSchema.safeParse(applicationId);
  if (!id.success) return applicationNotFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: "not-connected", message: "Your tracker is not switched on yet, so this change was not saved." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed-out", message: "Sign in to update your applications." };

  // Row-level security limits the read to the user's own rows, so another account's id is simply not found.
  const existing = await supabase.from("applications").select("id, data").eq("id", id.data).maybeSingle();
  if (existing.error) return saveFailed("read the tracker", existing.error.code);
  if (!existing.data) return applicationNotFound();
  const saved = ApplicationSchema.safeParse(existing.data.data);
  if (!saved.success) return saveFailed("read the tracker", "invalid-data");

  const application = applyChange(saved.data, parsedChange.data, londonToday());
  if (application.status === saved.data.status && application.nextStep === saved.data.nextStep) {
    return { ok: true, application: saved.data };
  }

  const { error } = await supabase.from("applications").update({ data: application }).eq("id", id.data);
  if (error) return saveFailed("update the tracker", error.code);

  if (application.status !== saved.data.status) {
    // The two statuses only: never the job, the company or the next step the user wrote.
    const properties = { from: saved.data.status, to: application.status };
    after(() => track("tracker.status_changed", properties, { userId: user.id }));
  }
  revalidatePath("/dashboard");
  return { ok: true, application };
}

function notFound(): RecordApplicationResult {
  return { ok: false, reason: "job-not-found", message: "We could not find this job in your account, so it was not added to your tracker." };
}

function failed(step: string, code: string | undefined): RecordApplicationResult {
  logFailure(step, code);
  return { ok: false, reason: "failed", message: "We could not add this job to your tracker. Try again in a moment." };
}

function applicationNotFound(): UpdateApplicationResult {
  return { ok: false, reason: "not-found", message: "We could not find this application in your account. Refresh the page and try again." };
}

function saveFailed(step: string, code: string | undefined): UpdateApplicationResult {
  logFailure(step, code);
  return { ok: false, reason: "failed", message: "We could not save this change. Try again in a moment." };
}

function logFailure(step: string, code: string | undefined) {
  // The step and the code only: never the job or anything the user wrote.
  console.error(`tracker: could not ${step} (${code ?? "unknown"})`);
}
