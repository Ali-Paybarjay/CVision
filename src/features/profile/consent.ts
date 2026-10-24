import { z } from "zod";
import { DateTimeSchema } from "@/shared/contracts";

/** Where an approved profile is kept: in the user's CVision account, or (when accounts are off) in this browser. */
export type ProfileStorageKind = "account" | "browser";

/**
 * What the user agrees to before we read their CV (UK GDPR: explicit, informed and specific).
 * A CV can hold special category data, such as health details, so we ask for explicit consent.
 * Change the version whenever the wording changes, so each stored consent shows what was agreed to.
 */
export const cvConsent = {
  version: "2026-10-24",
  label: "I agree that CVision reads my CV to build my profile.",
} as const;

/** The full privacy notice (card #43). The last consent point names it, and the upload step shows that name as a link. */
export const privacyPage = { href: "/privacy", name: "Privacy page" } as const;

/** The points above the consent box, true to where this profile will be kept. */
export function consentPoints(storage: ProfileStorageKind): string[] {
  return [
    "We read your work history, education, skills and certificates. You check every item before anything is saved.",
    "To read your CV, we send its text to Claude, an AI model by Anthropic, through OpenRouter on Google Cloud or Amazon Web Services. None of them keeps it.",
    storage === "account"
      ? "When you approve your profile, we save it and your CV file to your CVision account. You can download or delete them at any time."
      : "We don’t keep your CV file. Your profile is saved in this browser only, and you can download or delete it at any time.",
    "UK CVs don’t need a photo, your date of birth or health details. Leave out anything you don’t want us to process.",
    `Our ${privacyPage.name} says what we keep, where, for how long and who else sees it.`,
  ];
}

/** The record of the user's consent, kept with their profile. */
export const ConsentRecordSchema = z.object({
  version: z.string().min(1),
  givenAt: DateTimeSchema,
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
