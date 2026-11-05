import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { TailoredCvSchema, type TailoredCv } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { applyApprovedChanges } from "../saved-cv";
import { getMyProfile } from "./my-data";
import { getMySavedChanges } from "./saved-changes";

/** Signed in with Supabase connected, for a real job (a uuid). Sample jobs and visitors save nothing. */
async function clientFor(jobId: string) {
  if (!z.uuid().safeParse(jobId).success) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await getCurrentUser())) return null;
  return supabase;
}

/** "skipped" for a sample job, a visitor or no Supabase: nothing to save, and nothing to tell the user. */
export type SaveOutcome = "saved" | "skipped" | "failed";

/**
 * Saves the CV and cover letter the user is sending for one job, when they download a file or press Apply (#207).
 * The changes come from tailoring_changes, not from the browser, and only approved ones are kept. One row per job:
 * the latest download or Apply replaces the one before, but a save with no letter keeps the letter saved earlier. It never throws, so a failure never stops the download or
 * the Apply.
 */
export async function saveTailoredCv(jobId: string, coverLetter: string | null): Promise<SaveOutcome> {
  try {
    return await save(jobId, coverLetter);
  } catch {
    console.error("tailor: could not save the tailored CV (unexpected)");
    return "failed";
  }
}

async function save(jobId: string, coverLetter: string | null): Promise<SaveOutcome> {
  const supabase = await clientFor(jobId);
  if (!supabase) return "skipped";

  const [profile, changes, existing] = await Promise.all([
    getMyProfile({ jobId }),
    getMySavedChanges(jobId),
    supabase.from("tailored_cvs").select("data").eq("job_id", jobId).maybeSingle(),
  ]);
  if (!profile) return "failed";

  const approved = changes.filter((change) => change.status === "approved");
  const previous = TailoredCvSchema.safeParse(existing.data?.data);
  const data: TailoredCv = {
    id: previous.success ? previous.data.id : randomUUID(),
    jobId,
    cv: applyApprovedChanges(profile, approved),
    changes: approved,
    // No letter this time (e.g. the page was reloaded, so the letter is gone from it): keep the one saved before.
    coverLetter: coverLetter?.trim() ? coverLetter : previous.success ? previous.data.coverLetter : null,
    savedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("tailored_cvs").upsert({ job_id: jobId, data }, { onConflict: "job_id,user_id" });
  if (error) {
    // The code only: never the CV or letter text.
    console.error(`tailor: could not save the tailored CV (${error.code ?? "unknown"})`);
    return "failed";
  }
  return "saved";
}

/** The CV and cover letter last saved for one job, or null if there is none (or for sample jobs and visitors). */
export async function getMyTailoredCv(jobId: string): Promise<TailoredCv | null> {
  const supabase = await clientFor(jobId);
  if (!supabase) return null;

  const { data, error } = await supabase.from("tailored_cvs").select("data").eq("job_id", jobId).maybeSingle();
  if (error) {
    console.error(`tailor: could not read the tailored CV (${error.code ?? "unknown"})`);
    return null;
  }
  const parsed = TailoredCvSchema.safeParse(data?.data);
  return parsed.success && parsed.data.jobId === jobId ? parsed.data : null;
}
