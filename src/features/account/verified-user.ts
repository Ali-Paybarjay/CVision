import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { CurrentUser } from "./current-user";

/**
 * The signed-in user, checked with Supabase Auth itself, or null: for downloading or deleting everything (issue #43).
 *
 * getCurrentUser only checks the token's signature and expiry, so it still trusts a token from a session that was
 * signed out, or of a user who was deleted, until it expires. That is fine for showing a page, not for these.
 * This asks Supabase Auth, which knows both. It costs one request, and any error counts as signed out.
 */
export async function getVerifiedUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}
