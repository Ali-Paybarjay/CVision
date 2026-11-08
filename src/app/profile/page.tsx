import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/account/current-user";
import { loadAccountProfile } from "@/features/profile/server/profile-account";
import { ProfileBuilder } from "@/features/profile/ui/profile-builder";
import { SignInToStart } from "@/features/profile/ui/sign-in-to-start";
import { getAiMode } from "@/shared/ai";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Card, Page, PathSteps } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Your profile",
};

export default function ProfilePage() {
  return (
    <Page
      title="Your profile"
      description="Every tailored CV and cover letter is built only from the details you approve here."
    >
      <PathSteps current={1} />
      <Suspense
        fallback={
          <Card aria-busy="true">
            <p className="text-text-muted">Loading your profile…</p>
          </Card>
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
  // Keyed by account: Next keeps recent pages alive (cacheComponents), and without the key another account signing in
  // in this tab would get this one's state, including its saved profile and a CV in the file field (#336 review).
  return <ProfileBuilder key={user.id} demoMode={demoMode} storage={{ kind: "account", initial, account: user.id }} />;
}
