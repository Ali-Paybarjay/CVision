import type { Profile } from "@/shared/contracts";
import type { SaveReason, SaveResponse } from "../server/save-request";

/** The form field names of POST /profile/save (see saveFields in server/save-request.ts). */
const fields = { profile: "profile", cv: "cv", consent: "consent", reason: "reason" } as const;

/**
 * Saves the profile to the user's account through POST /profile/save, with the CV file when there is a new one.
 * Never throws: a network failure comes back as a message the user can act on.
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

  try {
    const response = await fetch("/profile/save", { method: "POST", body: form });
    return (await response.json()) as SaveResponse;
  } catch {
    return { ok: false, code: "failed", message: "We couldn’t reach CVision. Check your connection and try again." };
  }
}
