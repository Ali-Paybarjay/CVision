import "server-only";
import { after } from "next/server";
import { track } from "@/shared/analytics/track";
import { cvConsent, manualConsent } from "../consent";
import { cvFileMessages, MAX_CV_BYTES } from "../cv-limits";
import type { SupabaseServerClient } from "./job-store";
import { saveAccountProfile } from "./profile-account";
import { readProfileInput } from "./profile-input";
import { detectCvFormat, type CvFormat } from "./read-cv";

/** The names of the fields the profile page sends to POST /profile/save. */
export const saveFields = { profile: "profile", cv: "cv", consent: "consent", reason: "reason" } as const;

/** Why the profile is being saved: the user approved it in the review step (a new CV or an edit), or changed their job preferences. */
export type SaveReason = "approved" | "preferences";

export type SaveResponse =
  | { ok: true; savedAt: string; cvFormat: CvFormat | null }
  | { ok: false; code: "sign-in" | "forbidden" | "invalid" | "consent" | "file" | "failed"; message: string };

/**
 * Saves an approved profile (and its CV file, when there is a new one) to the user's account. Never throws.
 * A consent comes with a new CV file, or with a profile the user typed in by hand, with no CV.
 */
export async function handleSaveRequest(
  form: FormData,
  account: { supabase: SupabaseServerClient; userId: string },
): Promise<SaveResponse> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get(saveFields.profile) ?? ""));
  } catch {
    raw = null;
  }
  const input = readProfileInput(raw);
  if (!input.ok) {
    return { ok: false, code: "invalid", message: "Your profile could not be read. Reload the page and try again." };
  }

  const reasonField = form.get(saveFields.reason);
  const reason: SaveReason = reasonField === "preferences" ? reasonField : "approved";

  let cv: { bytes: Uint8Array; format: CvFormat } | undefined;
  const file = form.get(saveFields.cv);
  const consent = form.get(saveFields.consent);
  if (file instanceof File && file.size > 0) {
    // A CV file is only kept with the consent the user gave for it.
    if (consent !== cvConsent.version) {
      return { ok: false, code: "consent", message: "Upload your CV again and tick the box to agree, so we can keep it." };
    }
    if (file.size > MAX_CV_BYTES) return { ok: false, code: "file", message: cvFileMessages.tooLarge };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectCvFormat(bytes);
    if (format !== "pdf" && format !== "docx") return { ok: false, code: "file", message: cvFileMessages.wrongType };
    cv = { bytes, format };
  } else if (consent !== null && consent !== manualConsent.version) {
    // Without a file, the only consent is the one for a profile typed in by hand.
    return { ok: false, code: "consent", message: "Tick the box to agree, so we can save your profile." };
  }
  const manual = cv === undefined && consent === manualConsent.version;

  const saved = await saveAccountProfile(account.supabase, account.userId, input.profile, cv);
  if (!saved.ok) {
    return { ok: false, code: "failed", message: "We couldn’t save your profile just now. Try again in a minute." };
  }

  if (reason === "approved") {
    const { profile } = input;
    after(() =>
      track(
        "profile.approved",
        {
          newCv: cv !== undefined,
          manual,
          consentVersion: cv ? cvConsent.version : manual ? manualConsent.version : null,
          jobs: profile.experience.length,
          skills: profile.skills.length,
          answers: profile.followUpAnswers.length,
        },
        { userId: account.userId },
      ),
    );
  }
  return { ok: true, savedAt: saved.savedAt, cvFormat: saved.cvFormat };
}
