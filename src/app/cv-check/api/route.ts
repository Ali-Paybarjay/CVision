import { after } from "next/server";
import { getAnonymousKey } from "@/shared/ai";
import { track } from "@/shared/analytics/track";
import { cvFileMessages, MAX_CV_BYTES } from "@/features/profile/cv-limits";
import { handleCvCheckRequest, statusFor, type CvCheckResponse } from "@/features/cvcheck/server/check-request";

// POST /cv-check/api: the free CV check, open to visitors who are not signed in. A Route Handler rather than
// a Server Action, because Server Actions accept at most 1 MB and CVs with photos are often bigger.
// Nothing is stored: not the file, not the text, not the result.

/** Reading a slow PDF stops after 15 seconds, and the model can take half a minute, twice if it answers again. */
export const maxDuration = 60;

/** The file plus the form around it. */
const MAX_REQUEST_BYTES = MAX_CV_BYTES + 64 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return reply({ ok: false, code: "forbidden", message: "Check your CV from the CVision CV check page." });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return reply({ ok: false, code: "too-large", message: cvFileMessages.tooLarge });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, code: "missing", message: cvFileMessages.missing });
  }

  // A daily key from the visitor's IP address, never stored as the address itself, so the free limit applies.
  const requester = await getAnonymousKey();
  const response = await handleCvCheckRequest(form, { requester });
  if (response.ok) {
    const { score, issues } = response.result;
    // The score and the number of issues only: never CV text.
    after(() => track("cvcheck.completed", { score, issues: issues.length }, requester));
  }
  return reply(response);
}

function reply(body: CvCheckResponse) {
  return Response.json(body, { status: statusFor(body), headers: { "Cache-Control": "no-store" } });
}

/** Browsers send Origin with every POST, so another site's page cannot spend a visitor's free checks. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
