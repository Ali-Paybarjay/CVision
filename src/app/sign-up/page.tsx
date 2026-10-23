import type { Metadata } from "next";
import { Suspense } from "react";
import { accountsOffNotice } from "@/features/account/account-panel";
import { AuthForm } from "@/features/account/auth-form";
import { safeRedirectPath } from "@/features/account/safe-redirect";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Create your free account" };

// /sign-up?next=<path on this site> brings the user back to that page, also from the confirmation email.
export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const connected = isSupabaseConfigured();

  return (
    <Page
      title="Create your free account"
      description="Upload your CV once, then tailor it to every job you apply for."
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
  return <AuthForm mode="sign-up" disabled={disabled} next={safeRedirectPath(next)} />;
}
