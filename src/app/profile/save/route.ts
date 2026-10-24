import { getCurrentUser } from "@/features/account/current-user";
import { cvFileMessages, MAX_CV_BYTES } from "@/features/profile/cv-limits";
import { isSameOrigin } from "@/features/profile/server/same-origin";
import { handleSaveRequest, type SaveResponse } from "@/features/profile/server/save-request";
import { createSupabaseServerClient } from "@/shared/supabase/server";

// POST /profile/save: saves the approved profile to the user's account, with the CV file when there is a new one.
// A Route Handler rather than a Server Action, because Server Actions accept at most 1 MB and a CV can be up to 4 MB.

/** The file plus the profile and the form around it. */
const MAX_REQUEST_BYTES = MAX_CV_BYTES + 256 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return reply({ ok: false, code: "forbidden", message: "Save your profile from the CVision profile page." });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return reply({ ok: false, code: "file", message: cvFileMessages.tooLarge });
  }

  const supabase = await createSupabaseServerClient();
  const user = supabase ? await getCurrentUser() : null;
  if (!supabase || !user) {
    return reply({ ok: false, code: "sign-in", message: "Sign in to save your profile." });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, code: "invalid", message: "Your profile could not be read. Reload the page and try again." });
  }

  return reply(await handleSaveRequest(form, { supabase, userId: user.id }));
}

function reply(body: SaveResponse) {
  return Response.json(body, { status: statusFor(body), headers: { "Cache-Control": "no-store" } });
}

function statusFor(response: SaveResponse): number {
  if (response.ok) return 200;
  switch (response.code) {
    case "sign-in":
      return 401;
    case "forbidden":
      return 403;
    case "failed":
      return 502;
    default:
      return 400;
  }
}
