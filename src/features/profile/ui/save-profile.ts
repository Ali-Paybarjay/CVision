import type { Profile } from "@/shared/contracts";
import { cvFileMessages } from "../cv-limits";
import type { SaveReason, SaveResponse } from "../server/save-request";

/** The form field names of POST /profile/save (see saveFields in server/save-request.ts). */
const fields = { profile: "profile", cv: "cv", consent: "consent", reason: "reason" } as const;

/**
 * Saves the profile to the user's account through POST /profile/save, with the CV file when there is a new one.
 * Never throws: a lost connection, and an answer that isn't ours (the host stopping a request that ran out of time,
 * for example), each come back as a message the user can act on.
 */
export async function saveProfileToAccount(
  profile: Profile,
  options: { reason: SaveReason; cv?: File; consentVersion?: string },
): Promise<SaveResponse> {
  const form = new FormData();
  form.set(fields.profile, JSON.stringify(profile));
  form.set(fields.reason, options.reason);
  if (options.cv) form.set(fields.cv, options.cv);
  if (options.consentVersion) form.set(fields.consent, options.consentVersion);

  let response: Response;
  try {
    response = await fetch("/profile/save", { method: "POST", body: form });
  } catch {
    return { ok: false, code: "failed", message: "We couldn’t reach CVision. Check your connection and try again." };
  }
  const body: unknown = await response.json().catch(() => null);
  if (body !== null && typeof body === "object" && "ok" in body && typeof body.ok === "boolean") {
    return body as SaveResponse;
  }
  if (response.status === 413) return { ok: false, code: "file", message: cvFileMessages.tooLarge };
  if (response.status === 504) {
    return { ok: false, code: "failed", message: "Saving your profile took too long. Try again in a minute." };
  }
  return { ok: false, code: "failed", message: "Something went wrong on our side. Try again in a minute." };
}
