import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/account/current-user";
import { loadAccountProfile } from "@/features/profile/server/profile-account";
import { BackLink } from "@/features/profile/ui/back-link";
import { ProfileBuilder } from "@/features/profile/ui/profile-builder";
import { SignInToStart } from "@/features/profile/ui/sign-in-to-start";
import { getAiMode } from "@/shared/ai";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Your profile",
};

export default function ProfilePage() {
  return (
    <Page
      title="Your profile"
      description="Upload your CV or fill in your details yourself, then check and approve them. Every tailored CV and cover letter is built only from what you approve here."
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <BackLink href="/dashboard" />
            <Card aria-busy="true">
              <p className="text-text-muted">Loading your profile…</p>
            </Card>
          </div>
        }
      >
        <ProfileForVisitor demoMode={getAiMode() === "mock"} />
      </Suspense>
    </Page>
  );
}

/**
 * With accounts switched on, the profile lives in the user's account, so a signed-out visitor is asked to sign in
 * first. Without them (a computer with no Supabase settings), it lives in the browser, as before.
 */
async function ProfileForVisitor({ demoMode }: { demoMode: boolean }) {
  if (!isSupabaseConfigured()) return <ProfileBuilder demoMode={demoMode} storage={{ kind: "browser" }} />;

  // Reading the session checks the token's expiry against the clock, so it waits for the real request
  // instead of running while Next.js prerenders the page ahead of time.
  await connection();
  const [user, supabase] = await Promise.all([getCurrentUser(), createSupabaseServerClient()]);
  if (!user || !supabase) return <SignInToStart />;

  const initial = await loadAccountProfile(supabase);
  return <ProfileBuilder demoMode={demoMode} storage={{ kind: "account", initial }} />;
}
