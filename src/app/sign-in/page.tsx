import type { Metadata } from "next";
import { accountsOffNotice } from "@/features/account/account-panel";
import { AuthForm } from "@/features/account/auth-form";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const connected = isSupabaseConfigured();

  return (
    <Page title="Sign in">
      {!connected && accountsOffNotice}
      <Card className="max-w-md">
        <AuthForm mode="sign-in" disabled={!connected} />
      </Card>
    </Page>
  );
}
