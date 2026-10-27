import "server-only";
import { ProfileSchema, type Profile } from "@/shared/contracts";
import { fitsProfileLimit } from "../cv-limits";

export type ProfileInput = { ok: true; profile: Profile } | { ok: false; reason: "too-long" | "invalid" };

/**
 * Anything can be posted to a Server Action, so a profile from the browser is checked: its size first, then its shape.
 * One over MAX_PROFILE_CHARACTERS would cost money and time to read.
 */
export function readProfileInput(value: unknown): ProfileInput {
  if (!fitsProfileLimit(value)) return { ok: false, reason: "too-long" };
  const parsed = ProfileSchema.safeParse(value);
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, reason: "invalid" };
}
