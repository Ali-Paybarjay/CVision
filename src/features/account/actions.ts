"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { fullReloadField } from "./full-reload-field";
import { safeRedirectPath } from "./safe-redirect";

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
  if (error) return { error: "That email and password do not match an account." };

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
