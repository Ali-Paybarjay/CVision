import "server-only";
import type { z } from "zod";
import { askModel, loadPrompt, type AskModelOptions } from "@/shared/ai";
import { personas, type PersonaName } from "@/shared/sample-data";
import { CvExtractionSchema, extractionFromProfile, tidyExtraction, type CvExtraction } from "../cv-extraction";

export type Requester = AskModelOptions<z.ZodType>["requester"];

/**
 * Reads the details of a CV with askModel and prompts/profile-extract.md, for the user to check in the review step.
 * Anything the CV doesn't give stays empty; the review step asks the user to fill it.
 * In mock mode no model is called: the answer is the sample persona named in the CV (see samplePersonaFor).
 */
export async function extractProfile(cvText: string, options: { requester?: Requester } = {}): Promise<CvExtraction> {
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

  return tidyExtraction(extraction);
}

/** The persona whose full name appears in the CV, so each sample CV gets its own mock answer. Sara if none does. */
export function samplePersonaFor(cvText: string): PersonaName {
  const text = cvText.toLowerCase();
  const names = Object.keys(personas) as PersonaName[];
  return names.find((name) => text.includes(personas[name].profile.fullName.toLowerCase())) ?? "sara";
}

function sampleExtraction(cvText: string): CvExtraction {
  return extractionFromProfile(personas[samplePersonaFor(cvText)].profile);
}
