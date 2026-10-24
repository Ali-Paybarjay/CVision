"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { safeRedirectPath } from "./safe-redirect";

export type AuthFormState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
  /** Set after sign-up when the user must confirm their email first. */
  checkEmail?: string;
};

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

  // With email confirmation on, there is no session until the link is opened.
  if (!data.session) return { checkEmail: credentials.email };
  redirect(next);
}

export async function signIn(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { credentials, state } = readCredentials(formData);
  if (!credentials) return state;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: notConnected };

  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) return { error: "That email and password do not match an account." };

  redirect(readNext(formData));
}

/**
 * Signs out this browser only. SignOutButton clears CVision's data from this browser on the way (issue #35), and
 * each other device does the same when the user signs out there. Signing out everywhere (Supabase's default)
 * would sign the other devices out with nothing to clear their data.
 */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut({ scope: "local" });
  redirect("/");
}
