"use server";

import { createSupabaseServerClient } from "./server";

/**
 * The signed-in user's id, verified from their session token, or null.
 * A Server Function, so the site header can call it while @/shared/ui stays importable
 * from Client Components (a server-only import there would break every one of them).
 * Reads cookies, so render whatever calls it inside <Suspense>.
 */
export async function getSignedInUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}
