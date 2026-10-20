import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

/**
 * Supabase with the secret key: bypasses row-level security, so use it only on the server
 * and only for writes no user owns (usage events, AI usage) or full data deletion.
 * Returns null when SUPABASE_SECRET_KEY is not set.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  admin =
    url && secretKey
      ? createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return admin;
}
