"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { fullReloadField } from "./full-reload-field";
import { defaultDestination, newPasswordPath, pastNewPasswordStep, safeRedirectPath } from "./safe-redirect";

export type AuthFormState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
  /** Set after sign-up when the user must confirm their email first. */
  checkEmail?: string;
  /** Set after sign-up when the email already has an account, so no email is sent (#328). */
  existingAccount?: string;
  /** Set once signed in, when the form asked for a full page load: where to load (#350). */
  go?: string;
};

/** What signing out tells SignOutButton: where to load as a new page, when it asked for one (#350). */
export type SignOutState = { go?: string };

/**
 * Ends a sign-in, sign-up or sign-out at `path`. A form with JavaScript asks for a full page load (fullReloadField,
 * #350), so the path is returned for the browser to load; otherwise the redirect is already a full load.
 */
function arriveAt(formData: FormData | undefined, path: string): { go: string } {
  if (formData?.get(fullReloadField) === "1") return { go: path };
  redirect(path);
}

const CredentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

const notConnected = "Accounts are not switched on yet. Try again once the team has connected the database.";

// Signing in before the link in the email is opened (#507). The way to a new link is the one /sign-in/link-expired gives.
const notConfirmed =
  "Your email isn’t confirmed yet. Open the link we sent you, then sign in. If the link has expired, create your account again to get a new one.";

function readCredentials(formData: FormData) {
  const result = CredentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (result.success) return { credentials: result.data };
  const errors = z.flattenError(result.error).fieldErrors;
  return { state: { fieldErrors: { email: errors.email?.[0], password: errors.password?.[0] } } satisfies AuthFormState };
}

/** The page the user came from (the form's hidden `next` field), if it is on this site. */
function readNext(formData: FormData) {
  return safeRedirectPath(formData.get("next"));
}

export async function signUp(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { credentials, state } = readCredentials(formData);
  if (!credentials) return state;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: notConnected };

  const next = readNext(formData);
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    ...credentials,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };

  // An email that already has an account gets no email from Supabase, and a user with no identities back (#328).
  // Saying so, rather than "Check your email", sends the user to sign in instead of waiting for nothing.
  if (data.user && data.user.identities?.length === 0) return { existingAccount: credentials.email };

  // With email confirmation on, there is no session until the link is opened.
  if (!data.session) return { checkEmail: credentials.email };
  return arriveAt(formData, next);
}

export async function signIn(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { credentials, state } = readCredentials(formData);
  if (!credentials) return state;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: notConnected };

  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error?.code === "email_not_confirmed") return { error: notConfirmed };
  if (error) return { error: "That email and password do not match an account." };

  return arriveAt(formData, readNext(formData));
}

/** What the "Forgot your password?" form shows after it is sent. */
export type ResetRequestState = { error?: string; fieldError?: string; sentTo?: string };

/** What the "Choose a new password" form shows after it is sent. */
export type NewPasswordState = { error?: string; fieldError?: string; expired?: boolean; go?: string };

const EmailSchema = z.email("Enter a valid email address.");
const PasswordSchema = z.string().min(8, "Use at least 8 characters.");

/**
 * "Forgot your password?" (#524): emails a link that signs the user in and opens the page to choose a new password.
 * After sending, it says the same whether or not the email has an account (Supabase sends nothing to an unknown
 * address and doesn't say so). Sign up says when an email already has an account (#328), so this hides nothing more.
 */
export async function requestPasswordReset(_: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = EmailSchema.safeParse(formData.get("email"));
  if (!email.success) return { fieldError: z.flattenError(email.error).formErrors[0] ?? "Enter a valid email address." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: notConnected };

  // The page the user was heading to stays with them: after the new password, they go on there. A failed reset link
  // passes the new password page itself on as next; that step must not go inside the new link too.
  const next = pastNewPasswordStep(readNext(formData));
  const landing = next === defaultDestination ? newPasswordPath : `${newPasswordPath}?next=${encodeURIComponent(next)}`;
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(landing)}`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { error: "We can’t send another link just now. Wait a minute, then ask for a new one." };
  }
  if (error) return { error: "We couldn’t send the link just now. Try again in a minute." };
  return { sentTo: email.data };
}

/**
 * Saves the new password for the user the reset link signed in, then goes on to the page they were heading to, as a
 * full page load like signing in (#350). Without that sign-in (an expired link, or one opened in another browser)
 * nothing changes and the page offers a new link.
 */
export async function setNewPassword(_: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const password = PasswordSchema.safeParse(formData.get("password"));
  if (!password.success) return { fieldError: z.flattenError(password.error).formErrors[0] ?? "Use at least 8 characters." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: notConnected };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { expired: true };

  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error?.code === "same_password") return { fieldError: "That’s already your password. Choose a different one." };
  if (error?.code === "weak_password") return { fieldError: "Choose a longer or less common password." };
  if (error) return { error: "We couldn’t save your new password. Try again in a minute." };

  return arriveAt(formData, readNext(formData));
}

/**
 * Signs out this browser only. SignOutButton clears CVision's data from this browser on the way (issue #35), and
 * each other device does the same when the user signs out there. Signing out everywhere (Supabase's default)
 * would sign the other devices out with nothing to clear their data.
 */
export async function signOut(_state?: SignOutState, formData?: FormData): Promise<SignOutState> {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut({ scope: "local" });
  return arriveAt(formData, "/");
}
