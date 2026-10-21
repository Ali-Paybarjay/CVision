import "server-only";
import { AskModelError, getAiMode } from "@/shared/ai";
import type { Profile } from "@/shared/contracts";
import { cvConsent } from "../consent";
import { extractProfile, type Requester } from "./extract-profile";
import { CvFileError, cvFileMessages, MAX_CV_BYTES, readCvText, type CvFileErrorCode, type CvFormat } from "./read-cv";

/** What POST /profile/extract answers. */
export type ExtractResponse =
  | {
      ok: true;
      profile: Profile;
      format: CvFormat;
      /** True when only the start of a very long CV was read. */
      truncated: boolean;
      /**
       * Set in mock mode, where no model reads the CV: `persona` is whose sample profile was returned instead,
       * and `text` is what was read from the user's file, so they can see their CV itself was read.
       */
      demo: { persona: string; text: string } | null;
    }
  | { ok: false; code: CvFileErrorCode | "consent" | "forbidden" | "sign-in" | AiErrorCode; message: string };

export type AiErrorCode = "ai-unavailable" | "ai-busy" | "ai-failed" | "limit-reached";

/** The names of the fields the upload form sends. */
export const extractFields = { file: "cv", consent: "consent" } as const;

/** Reads an uploaded CV into a Profile, after checking the user agreed to it. Never throws. */
export async function handleExtractRequest(
  form: FormData,
  options: { requester?: Requester } = {},
): Promise<ExtractResponse> {
  if (form.get(extractFields.consent) !== cvConsent.version) {
    return { ok: false, code: "consent", message: "Tick the box to agree, so we can read your CV." };
  }

  const file = form.get(extractFields.file);
  if (!(file instanceof File) || (file.size === 0 && file.name === "")) {
    return { ok: false, code: "missing", message: cvFileMessages.missing };
  }
  if (file.size > MAX_CV_BYTES) {
    return { ok: false, code: "too-large", message: cvFileMessages.tooLarge };
  }

  try {
    const cv = await readCvText({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    const profile = await extractProfile(cv.text, { requester: options.requester });
    const demo = getAiMode() === "mock" ? { persona: profile.fullName, text: cv.text } : null;
    return { ok: true, profile, format: cv.format, truncated: cv.truncated, demo };
  } catch (error) {
    if (error instanceof CvFileError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, ...describeAiError(error, "We couldn’t read the details from this CV.") };
  }
}

/** The HTTP status for a response, so logs and tools see failures as failures. */
export function statusFor(response: ExtractResponse): number {
  if (response.ok) return 200;
  switch (response.code) {
    case "sign-in":
      return 401;
    case "forbidden":
      return 403;
    case "too-large":
      return 413;
    case "limit-reached":
    case "ai-busy":
      return 429;
    case "ai-unavailable":
    case "ai-failed":
      return 502;
    default:
      return 400;
  }
}

/**
 * A message the user can act on for an error from askModel.
 * `whatFailed` starts the message when the model's answer was unusable, e.g. "We couldn’t read the details from this CV."
 */
export function describeAiError(error: unknown, whatFailed: string): { code: AiErrorCode; message: string } {
  // Log the kind of failure only: never the CV text or the model's answer.
  console.error("profile: AI request failed:", error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : error);

  if (error instanceof AskModelError) {
    // The daily limit's message is written for the user.
    if (error.reason === "limit-reached") return { code: "limit-reached", message: error.message };
    if (error.reason === "no-api-key") {
      return { code: "ai-unavailable", message: "This part of CVision is switched off at the moment. Try again later." };
    }
    return { code: "ai-failed", message: `${whatFailed} Try again in a moment.` };
  }
  if (error instanceof Error && "status" in error && error.status === 429) {
    return { code: "ai-busy", message: "CVision is busy right now. Try again in a minute." };
  }
  return { code: "ai-unavailable", message: "We couldn’t reach our AI service. Try again in a minute." };
}
