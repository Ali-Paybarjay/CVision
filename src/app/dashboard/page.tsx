import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPanel, AccountPanelFallback } from "@/features/account/account-panel";
import { Tracker, TrackerFallback } from "@/features/tracker/tracker";
import { ButtonLink, Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Page title="Dashboard" description="Every job you have applied for, where it stands and what to do next." width="wide">
      <Suspense fallback={<TrackerFallback />}>
        <Tracker />
      </Suspense>
      <TwoChecks />
      <Suspense fallback={<AccountPanelFallback />}>
        <AccountPanel />
      </Suspense>
    </Page>
  );
}

/**
 * The two checks answer different questions, and their forms look alike, so each is named by its question. Plain
 * links, so the tracker's own Coral button stays the page's only one.
 */
function TwoChecks() {
  return (
    <Card aria-labelledby="two-checks-heading">
      <h2 id="two-checks-heading" className="text-xl">
        Two different checks
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h3 className="font-semibold">Am I right for this job?</h3>
          <p className="text-text-muted">Paste one job ad and see where your profile already matches it.</p>
          <ButtonLink href="/jobs" className="mt-auto">
            Check a job
          </ButtonLink>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h3 className="font-semibold">Is my CV ready?</h3>
          <p className="text-text-muted">Check your CV on its own and see what to fix first for UK employers.</p>
          <ButtonLink href="/cv-check" className="mt-auto">
            Check my CV
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
