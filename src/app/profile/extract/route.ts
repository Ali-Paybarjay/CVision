import { getCurrentUser } from "@/features/account/current-user";
import { cvFileMessages, MAX_CV_BYTES } from "@/features/profile/cv-limits";
import { modelAccessFor } from "@/features/profile/server/access";
import { handleExtractRequest, statusFor, type ExtractResponse } from "@/features/profile/server/extract-request";
import { getAiMode } from "@/shared/ai";

// POST /profile/extract: the CV upload. A Route Handler rather than a Server Action,
// because Server Actions accept at most 1 MB and CVs with photos or design templates are often bigger.

/**
 * Reading the file takes a second or two, and a slow PDF is stopped after 15 seconds (see pdf.ts).
 * In live mode the model can take half a minute on a long CV, and twice that if it has to answer again,
 * so 60 seconds could stop a request that was about to succeed.
 */
export const maxDuration = 120;

/** The file plus the form around it. */
const MAX_REQUEST_BYTES = MAX_CV_BYTES + 64 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return reply({ ok: false, code: "forbidden", message: "Upload your CV from the CVision profile page." });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return reply({ ok: false, code: "too-large", message: cvFileMessages.tooLarge });
  }

  // Checked before the upload is read: in live mode every CV read is a paid model request.
  const access = modelAccessFor(await getCurrentUser(), getAiMode());
  if (!access.allowed) {
    return reply({ ok: false, code: "sign-in", message: "Sign in to upload your CV." });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, code: "missing", message: cvFileMessages.missing });
  }

  return reply(await handleExtractRequest(form, { requester: access.requester }));
}

function reply(body: ExtractResponse) {
  return Response.json(body, { status: statusFor(body), headers: { "Cache-Control": "no-store" } });
}

/** Browsers send Origin with every POST, so another site's page cannot upload on a visitor's behalf. */
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
