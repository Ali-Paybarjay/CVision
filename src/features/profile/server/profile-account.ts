import "server-only";
import { ProfileSchema, type Profile } from "@/shared/contracts";
import type { SupabaseServerClient } from "./job-store";
import type { CvFormat } from "./read-cv";

// The approved profile in the user's CVision account: the Profile in the profiles table, and the CV file in the
// private cvs bucket under a folder named after the user id. Row-level security and the storage policies keep
// both to their owner. Nothing here runs before the user approves their profile (You approve everything).

const BUCKET = "cvs";

const contentTypes: Record<CvFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The saved profile, as the profile page shows it. */
export type AccountProfile = {
  profile: Profile;
  /** When it last changed, in UTC. */
  savedAt: string;
  /** The format of the saved CV file, or null if there is none. */
  cvFormat: CvFormat | null;
};

export async function loadAccountProfile(supabase: SupabaseServerClient): Promise<AccountProfile | null> {
  const { data, error } = await supabase.from("profiles").select("data, cv_file_path, updated_at").maybeSingle();
  if (error) {
    console.error("profile: could not read the saved profile:", error.message);
    return null;
  }
  if (!data) return null;
  const parsed = ProfileSchema.safeParse(data.data);
  if (!parsed.success) {
    console.error("profile: the saved profile doesn't match its contract");
    return null;
  }
  return { profile: parsed.data, savedAt: new Date(data.updated_at).toISOString(), cvFormat: formatOf(data.cv_file_path) };
}

export type SaveResult = { ok: true; savedAt: string; cvFormat: CvFormat | null } | { ok: false };

/**
 * Saves the approved profile, and the CV file it came from when there is a new one.
 * The new file gets its own name, so the old one is removed only after the profile row points at the new one:
 * a failure part-way never leaves the profile without its file.
 */
export async function saveAccountProfile(
  supabase: SupabaseServerClient,
  userId: string,
  profile: Profile,
  cv?: { bytes: Uint8Array; format: CvFormat },
): Promise<SaveResult> {
  let newPath: string | null = null;
  let oldPath: string | null = null;

  if (cv) {
    const { data: existing } = await supabase.from("profiles").select("cv_file_path").maybeSingle();
    oldPath = existing?.cv_file_path ?? null;
    newPath = `${userId}/cv-${Date.now()}.${cv.format}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, cv.bytes, { contentType: contentTypes[cv.format], upsert: false });
    if (error) {
      console.error("profile: could not save the CV file:", error.message);
      return { ok: false };
    }
  }

  // user_id is filled in by the database from the session, and is the conflict target: one profile per user.
  const row: { data: Profile; cv_file_path?: string } = { data: profile };
  if (newPath) row.cv_file_path = newPath;
  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("cv_file_path, updated_at")
    .single();
  if (error || !data) {
    console.error("profile: could not save the profile:", error?.message);
    if (newPath) await supabase.storage.from(BUCKET).remove([newPath]);
    return { ok: false };
  }

  if (oldPath && oldPath !== newPath) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
    if (removeError) console.error("profile: could not remove the old CV file:", removeError.message);
  }
  return { ok: true, savedAt: new Date(data.updated_at).toISOString(), cvFormat: formatOf(data.cv_file_path) };
}

/** Deletes the saved profile and every CV file in the user's folder (Your data is yours). */
export async function deleteAccountProfile(supabase: SupabaseServerClient, userId: string): Promise<boolean> {
  const { data: files, error: listError } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (listError) {
    console.error("profile: could not list the CV files:", listError.message);
    return false;
  }
  if (files && files.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(files.map((file: { name: string }) => `${userId}/${file.name}`));
    if (error) {
      console.error("profile: could not delete the CV files:", error.message);
      return false;
    }
  }

  const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
  if (error) {
    console.error("profile: could not delete the profile:", error.message);
    return false;
  }
  return true;
}

function formatOf(path: string | null | undefined): CvFormat | null {
  if (!path) return null;
  if (path.endsWith(".pdf")) return "pdf";
  if (path.endsWith(".docx")) return "docx";
  return null;
}
