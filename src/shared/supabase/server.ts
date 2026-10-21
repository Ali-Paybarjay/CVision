import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

/**
 * Supabase as the signed-in user, for Server Components, Server Actions and Route Handlers.
 * Row-level security applies. Returns null when Supabase is not configured yet.
 * Reading cookies makes the caller dynamic: render it inside <Suspense>.
 */
export async function createSupabaseServerClient() {
  const env = getSupabasePublicEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies; src/proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
