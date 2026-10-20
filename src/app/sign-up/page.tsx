import type { Metadata } from "next";
import { accountsOffNotice } from "@/features/account/account-panel";
import { AuthForm } from "@/features/account/auth-form";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Create your free account" };

export default function SignUpPage() {
  const connected = isSupabaseConfigured();

  return (
    <Page
      title="Create your free account"
      description="Upload your CV once, then tailor it to every job you apply for."
    >
      {!connected && accountsOffNotice}
      <Card className="max-w-md">
        <AuthForm mode="sign-up" disabled={!connected} />
      </Card>
    </Page>
  );
}
