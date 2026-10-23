import { z } from "zod";
import { DateTimeSchema } from "@/shared/contracts";

/**
 * What the user agrees to before we read their CV (UK GDPR: explicit, informed and specific).
 * A CV can hold special category data, such as health details, so we ask for explicit consent.
 * Change the version whenever the wording changes, so each stored consent shows what was agreed to.
 */
export const cvConsent = {
  version: "2026-10-23",
  label: "I agree that CVision reads my CV to build my profile.",
  points: [
    "We read your work history, education, skills and certificates. You check every item before anything is saved.",
    "To read your CV, we send its text to Claude, an AI model by Anthropic, through OpenRouter on Google Cloud or Amazon Web Services. None of them keeps it, and we don’t keep the file.",
    "Your profile is saved in this browser only. You can download it or delete it at any time.",
    "UK CVs don’t need a photo, your date of birth or health details. Leave out anything you don’t want us to process.",
  ],
} as const;

/** The record of the user's consent, kept with their profile. */
export const ConsentRecordSchema = z.object({
  version: z.string().min(1),
  givenAt: DateTimeSchema,
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
