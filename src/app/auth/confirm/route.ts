import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/features/account/safe-redirect";
import { createSupabaseServerClient } from "@/shared/supabase/server";

// The link in a confirmation email lands here, signs the user in and sends them on.
// It accepts both link styles Supabase can send:
// - the default template: ?code=… (works in the browser where the user signed up)
// - a custom template linking to {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
//   (works on any device)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only a path on this site, never another domain.
  const destination = safeRedirectPath(searchParams.get("next"), request.url);

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : tokenHash && type
        ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        : { error: new Error("No code or token in the link") };
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.redirect(new URL("/sign-in/link-expired", request.url));
}
