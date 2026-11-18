import type { Metadata } from "next";
import { Suspense } from "react";
import { accountsOffNotice } from "@/features/account/account-panel";
import { ForgotPasswordForm } from "@/features/account/password-reset-forms";
import { pastNewPasswordStep, safeRedirectPath } from "@/features/account/safe-redirect";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Reset your password" };

// /sign-in/forgot?next=<path on this site>: "Forgot your password?" (#524). After the new password, the user goes on
// to that page.
export default function ForgotPasswordPage({ searchParams }: PageProps<"/sign-in/forgot">) {
  const connected = isSupabaseConfigured();

  return (
    <Page title="Reset your password" description="Enter the email you use for CVision. We’ll send you a link to choose a new password.">
      {!connected && accountsOffNotice}
      <Card className="max-w-md">
        <Suspense fallback={<ForgotPasswordForm disabled />}>
          <ForgotPasswordFromUrl searchParams={searchParams} disabled={!connected} />
        </Suspense>
      </Card>
    </Page>
  );
}

async function ForgotPasswordFromUrl({ searchParams, disabled }: Pick<PageProps<"/sign-in/forgot">, "searchParams"> & { disabled: boolean }) {
  const { next } = await searchParams;
  return <ForgotPasswordForm next={pastNewPasswordStep(safeRedirectPath(next))} disabled={disabled} />;
}
