import type { Metadata } from "next";
import { Suspense } from "react";
import { accountsOffNotice } from "@/features/account/account-panel";
import { AuthForm } from "@/features/account/auth-form";
import { getCurrentUser } from "@/features/account/current-user";
import { safeRedirectPath } from "@/features/account/safe-redirect";
import { SignedInNotice } from "@/features/account/signed-in-notice";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Create your free account" };

// /sign-up?next=<path on this site> brings the user back to that page, also from the confirmation email.
export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const connected = isSupabaseConfigured();

  return (
    <Page
      title="Create your free account"
      description="Build your profile once, then tailor your CV to every job you apply for."
    >
      {!connected && accountsOffNotice}
      <Card className="max-w-md">
        <Suspense fallback={<AuthForm mode="sign-up" disabled />}>
          <SignUpForm searchParams={searchParams} disabled={!connected} />
        </Suspense>
      </Card>
    </Page>
  );
}

async function SignUpForm({ searchParams, disabled }: Pick<PageProps<"/sign-up">, "searchParams"> & { disabled: boolean }) {
  const { next } = await searchParams;
  const destination = safeRedirectPath(next);
  // Someone already signed in, say from the home page's main button, gets their account instead of the form (#328).
  const user = disabled ? null : await getCurrentUser();
  if (user) return <SignedInNotice mode="sign-up" email={user.email} next={destination} />;
  return <AuthForm mode="sign-up" disabled={disabled} next={destination} />;
}
