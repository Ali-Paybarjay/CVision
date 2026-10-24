import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

/**
 * Supabase with the secret key: bypasses row-level security, so use it only on the server
 * and only for writes no user owns (usage events, AI usage), full data deletion, or counting rows
 * in those logs (the daily AI limit, a once-per-session event check). Count with
 * `{ count: "exact", head: true }` so no rows come back, and filter on names and ids only.
 * One read of whole rows is allowed: the signed-in user's own data on their Your data page (download
 * and the summary before deletion). That covers their events and ai_usage rows, their account details
 * (auth.admin.getUserById) and their CV files under cvs/<user id>/, always filtered on the user id
 * from the server session, never on an id the browser sends.
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
