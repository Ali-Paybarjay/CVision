import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/account/current-user";
import { loadAccountProfile } from "@/features/profile/server/profile-account";
import { BackLink } from "@/features/profile/ui/back-link";
import { JobChecker } from "@/features/profile/ui/job-checker";
import { getAiMode } from "@/shared/ai";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Card, Page } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Check a job ad",
};

/** Two model requests per check (reading the ad, then the match), each of which may be asked twice. */
export const maxDuration = 120;

export default function JobsPage() {
  return (
    <Page
      title="Check a job ad"
      description="Paste a job ad. We find what the employer is asking for, and where your experience already matches."
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <BackLink href="/profile" />
            <Card aria-busy="true">
              <p className="text-text-muted">Loading your profile…</p>
            </Card>
          </div>
        }
      >
        <JobsForVisitor demoMode={getAiMode() === "mock"} />
      </Suspense>
    </Page>
  );
}

/** The profile to compare with: from the account when accounts are on, otherwise from this browser. */
async function JobsForVisitor({ demoMode }: { demoMode: boolean }) {
  if (!isSupabaseConfigured()) return <JobChecker demoMode={demoMode} source={{ kind: "browser" }} />;

  // Reading the session checks the token's expiry against the clock, so it waits for the real request
  // instead of running while Next.js prerenders the page ahead of time.
  await connection();
  const [user, supabase] = await Promise.all([getCurrentUser(), createSupabaseServerClient()]);
  if (!user || !supabase) return <JobChecker demoMode={demoMode} source={{ kind: "signed-out" }} />;

  const saved = await loadAccountProfile(supabase);
  return <JobChecker demoMode={demoMode} source={{ kind: "account", profile: saved?.profile ?? null }} />;
}
