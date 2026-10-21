import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

/** Supabase in Client Components, as the signed-in user. Returns null when Supabase is not configured yet. */
export function createSupabaseBrowserClient() {
  const env = getSupabasePublicEnv();
  return env ? createBrowserClient(env.url, env.publishableKey) : null;
}
