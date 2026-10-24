"use server";

import { getCurrentUser } from "@/features/account/current-user";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { deleteAccountProfile } from "./server/profile-account";

/** Deletes the signed-in user's saved profile and every CV file they uploaded (Your data is yours). */
export async function deleteMyProfileAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getCurrentUser() : null;
  if (!supabase || !user) return { ok: false, message: "Sign in to delete your profile." };

  return (await deleteAccountProfile(supabase, user.id))
    ? { ok: true }
    : { ok: false, message: "We couldn’t delete your profile just now. Try again in a minute." };
}
