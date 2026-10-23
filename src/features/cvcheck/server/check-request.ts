import "server-only";
import { AskModelError, type Requester } from "@/shared/ai";
import type { CvCheckResult } from "@/shared/contracts";
import { cleanCvText, CvFileError, cvFileMessages, MAX_CV_BYTES, MAX_CV_CHARACTERS, readCvText } from "@/features/profile/server/read-cv";
import { checkCv } from "./check-cv";

/** What POST /cv-check/api answers. */
export type CvCheckResponse =
  | {
      ok: true;
      result: CvCheckResult;
      /** True when only the start of a very long CV was checked. */
      truncated: boolean;
    }
  | { ok: false; code: CvCheckErrorCode; message: string };

export type CvCheckErrorCode =
  | "missing"
  | "too-short"
  | "too-long"
  | "too-large"
  | "forbidden"
  | CvFileError["code"]
  | "limit-reached"
  | "ai-unavailable"
  | "ai-busy"
  | "ai-failed";

/** The names of the fields the form sends: a file, or pasted text. */
export const cvCheckFields = { file: "cv", text: "cvText" } as const;

/** Pasted text with fewer letters than this is not a whole CV. */
const MIN_PASTED_LETTERS = 150;

export const cvCheckMessages = {
  missing: "Upload your CV, or paste its text, then check it.",
  tooShort: "This looks too short to be a whole CV. Paste all of it, from your name to your education.",
  tooLong: "This is longer than any CV we check (about 7,500 words). Paste only your CV.",
} as const;

/** Reads the CV from the form, checks it and returns the result. Stores nothing. Never throws. */
export async function handleCvCheckRequest(form: FormData, options: { requester?: Requester } = {}): Promise<CvCheckResponse> {
  const file = form.get(cvCheckFields.file);
  const pasted = form.get(cvCheckFields.text);
  const hasFile = file instanceof File && !(file.size === 0 && file.name === "");
  const hasText = typeof pasted === "string" && pasted.trim() !== "";

  let cvText: string;
  let truncated = false;
  if (hasFile) {
    if (file.size > MAX_CV_BYTES) return { ok: false, code: "too-large", message: cvFileMessages.tooLarge };
    try {
      const cv = await readCvText({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      cvText = cv.text;
      truncated = cv.truncated;
    } catch (error) {
      if (error instanceof CvFileError) return { ok: false, code: error.code, message: error.message };
      return { ok: false, code: "unreadable", message: cvFileMessages.unreadable };
    }
  } else if (hasText) {
    cvText = cleanCvText(pasted);
    if (cvText.length > MAX_CV_CHARACTERS) return { ok: false, code: "too-long", message: cvCheckMessages.tooLong };
    if ((cvText.match(/\p{L}/gu)?.length ?? 0) < MIN_PASTED_LETTERS) {
      return { ok: false, code: "too-short", message: cvCheckMessages.tooShort };
    }
  } else {
    return { ok: false, code: "missing", message: cvCheckMessages.missing };
  }

  try {
    return { ok: true, result: await checkCv(cvText, { requester: options.requester }), truncated };
  } catch (error) {
    return { ok: false, ...describeAiError(error) };
  }
}

/** The HTTP status for a response, so logs and tools see failures as failures. */
export function statusFor(response: CvCheckResponse): number {
  if (response.ok) return 200;
  switch (response.code) {
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

function describeAiError(error: unknown): { code: CvCheckErrorCode; message: string } {
  // Log the kind of failure only: never the CV text or the model's answer.
  console.error("cvcheck: AI request failed:", error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : error);

  if (error instanceof AskModelError) {
    // The daily limit's message is written for the visitor and asks them to create a free account.
    if (error.reason === "limit-reached") return { code: "limit-reached", message: error.message };
    if (error.reason === "no-api-key") {
      return { code: "ai-unavailable", message: "The free CV check is switched off at the moment. Try again later." };
    }
    return { code: "ai-failed", message: "We couldn’t finish checking this CV. Try again in a moment." };
  }
  if (error instanceof Error && "status" in error && error.status === 429) {
    return { code: "ai-busy", message: "CVision is busy right now. Try again in a minute." };
  }
  return { code: "ai-unavailable", message: "We couldn’t reach our AI service. Try again in a minute." };
}
