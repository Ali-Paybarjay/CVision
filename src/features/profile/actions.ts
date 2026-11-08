"use server";

import { getCurrentUser } from "@/features/account/current-user";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { deleteAccountProfile } from "./server/profile-account";
import { otherAccountMessage } from "./server/same-account";

/**
 * Deletes the signed-in user's saved profile and every CV file they uploaded (Your data is yours). `account` is the
 * account the page was built for: a page left open while someone else signed in refuses, rather than deleting the
 * profile of the account signed in now (#389, as #366 does for uploads and saves).
 */
export async function deleteMyProfileAction(account?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getCurrentUser() : null;
  if (!supabase || !user) return { ok: false, message: "Sign in to delete your profile." };
  if (account && account !== user.id) return { ok: false, message: otherAccountMessage };

  return (await deleteAccountProfile(supabase, user.id))
    ? { ok: true }
    : { ok: false, message: "We couldn’t delete your profile just now. Try again in a minute." };
}
