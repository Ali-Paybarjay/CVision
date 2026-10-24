import "server-only";
import { ProfileSchema, type Profile } from "@/shared/contracts";

/**
 * Well above any real profile: a CV is cut at 30,000 characters before it becomes one, and answers are short.
 * A bigger one is not from our pages, and would cost money and time to read.
 */
export const MAX_PROFILE_CHARACTERS = 60_000;

export type ProfileInput = { ok: true; profile: Profile } | { ok: false; reason: "too-long" | "invalid" };

/** Anything can be posted to a Server Action, so a profile from the browser is checked: its size first, then its shape. */
export function readProfileInput(value: unknown): ProfileInput {
  if (!fitsSizeLimit(value)) return { ok: false, reason: "too-long" };
  const parsed = ProfileSchema.safeParse(value);
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, reason: "invalid" };
}

function fitsSizeLimit(value: unknown): boolean {
  try {
    return (JSON.stringify(value) ?? "").length <= MAX_PROFILE_CHARACTERS;
  } catch {
    // Not plain data (a loop, for example), so not a profile either.
    return false;
  }
}
