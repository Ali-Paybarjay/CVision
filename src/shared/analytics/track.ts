import "server-only";
import { getSupabaseAdmin } from "@/shared/supabase/admin";

/** Who did it: a signed-in user, or an anonymous visitor key from getAnonymousKey(). */
export type EventActor = { userId: string } | { anonymousKey: string };

/** Event names are "<area>.<action>" in lower case, e.g. "profile.cv_uploaded" or "cvcheck.completed". */
const eventNamePattern = /^[a-z]+\.[a-z_]+$/;

/**
 * Records one usage event in the events table. Never throws, so it cannot break the user's flow.
 * Use it after the response is sent: `after(() => track("tailor.cv_exported", { format: "pdf" }, { userId }))`.
 * Never put CV text or other personal details in `properties`.
 */
export async function track(name: string, properties: Record<string, unknown> = {}, actor?: EventActor): Promise<void> {
  if (!eventNamePattern.test(name)) {
    console.warn(`track: "${name}" is not a valid event name; use "<area>.<action>"`);
    return;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    if (process.env.NODE_ENV === "development") console.info("track (not stored):", name, properties);
    return;
  }

  const { error } = await admin.from("events").insert({
    name,
    properties,
    user_id: actor && "userId" in actor ? actor.userId : null,
    anonymous_id: actor && "anonymousKey" in actor ? actor.anonymousKey : null,
  });
  if (error) console.error("track: could not record event", name, error.message);
}
