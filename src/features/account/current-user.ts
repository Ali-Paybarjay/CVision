import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in user, verified from their session token, or null.
 * Reads cookies, so render whatever calls it inside <Suspense>.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
