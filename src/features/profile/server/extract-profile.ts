import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { askModel, loadPrompt, type AskModelOptions } from "@/shared/ai";
import type { Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { CvExtractionSchema, profileFromExtraction, type CvExtraction } from "../cv-extraction";

export type Requester = AskModelOptions<z.ZodType>["requester"];

/**
 * Turns the text of a CV into a Profile with askModel and prompts/profile-extract.md.
 * In mock mode no model is called: the answer is the sample persona named in the CV (see samplePersonaFor).
 */
export async function extractProfile(cvText: string, options: { requester?: Requester } = {}): Promise<Profile> {
  const extraction = await askModel({
    feature: "profile-extract",
    // The CV is data, like a job ad: a <cv> tag inside it must not close the prompt's own section early.
    prompt: await loadPrompt("profile-extract", { cv: cvText.replace(/<\s*\/?\s*cv\b[^>]*>/gi, "") }),
    schema: CvExtractionSchema,
    sample: sampleExtraction(cvText),
    // Pure data extraction: the brand voice would only invite rewording.
    voice: false,
    requester: options.requester,
  });

  return profileFromExtraction(extraction, randomUUID());
}

/** The persona whose full name appears in the CV, so each sample CV gets its own mock answer. Sara if none does. */
export function samplePersonaFor(cvText: string): PersonaName {
  const text = cvText.toLowerCase();
  const names = Object.keys(personas) as PersonaName[];
  return names.find((name) => text.includes(personas[name].profile.fullName.toLowerCase())) ?? "sara";
}

function sampleExtraction(cvText: string): CvExtraction {
  return CvExtractionSchema.parse(personas[samplePersonaFor(cvText)].profile);
}
