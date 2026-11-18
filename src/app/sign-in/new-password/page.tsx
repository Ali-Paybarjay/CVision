import type { Metadata } from "next";
import { Suspense } from "react";
import { accountsOffNotice } from "@/features/account/account-panel";
import { getCurrentUser } from "@/features/account/current-user";
import { NewPasswordForm, ResetLinkExpired } from "@/features/account/password-reset-forms";
import { safeRedirectPath } from "@/features/account/safe-redirect";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Choose a new password" };

// The link in a "reset your password" email lands here through /auth/confirm, which has signed the user in (#524).
// A link that fails goes to /sign-in/link-expired instead; without a sign-in (the page opened on its own, or the
// session has ended) this page asks for the link from the email.
export default function NewPasswordPage({ searchParams }: PageProps<"/sign-in/new-password">) {
  const connected = isSupabaseConfigured();

  return (
    <Page title="Choose a new password">
      {!connected && accountsOffNotice}
      <Card className="max-w-md">
        <Suspense fallback={<p className="text-text-muted">Checking your link…</p>}>
          <NewPasswordFromSession searchParams={searchParams} connected={connected} />
        </Suspense>
      </Card>
    </Page>
  );
}

async function NewPasswordFromSession({ searchParams, connected }: Pick<PageProps<"/sign-in/new-password">, "searchParams"> & { connected: boolean }) {
  const next = safeRedirectPath((await searchParams).next);
  const user = connected ? await getCurrentUser() : null;
  if (!user) return <ResetLinkExpired next={next} />;
  return <NewPasswordForm email={user.email} next={next} />;
}
