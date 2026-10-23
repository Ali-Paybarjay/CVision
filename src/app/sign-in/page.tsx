import type { Metadata } from "next";
import { Suspense } from "react";
import { accountsOffNotice } from "@/features/account/account-panel";
import { AuthForm } from "@/features/account/auth-form";
import { safeRedirectPath } from "@/features/account/safe-redirect";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Sign in" };

// /sign-in?next=<path on this site> brings the user back to that page afterwards.
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const connected = isSupabaseConfigured();

  return (
    <Page title="Sign in">
      {!connected && accountsOffNotice}
      <Card className="max-w-md">
        <Suspense fallback={<AuthForm mode="sign-in" disabled />}>
          <SignInForm searchParams={searchParams} disabled={!connected} />
        </Suspense>
      </Card>
    </Page>
  );
}

async function SignInForm({ searchParams, disabled }: Pick<PageProps<"/sign-in">, "searchParams"> & { disabled: boolean }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" disabled={disabled} next={safeRedirectPath(next)} />;
}
