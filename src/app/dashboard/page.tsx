import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPanel, AccountPanelFallback } from "@/features/account/account-panel";
import { getCurrentUser } from "@/features/account/current-user";
import { Tracker, TrackerFallback } from "@/features/tracker/tracker";
import { brand } from "@/shared/brand";
import { ButtonLink, Card, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Page title="Dashboard" description="Every job you have applied for, where it stands and what to do next." width="wide">
      {/* One boundary, so the two checks arrive with the tracker, after its jobs in progress, rather than pop in. */}
      <Suspense fallback={<TrackerFallback />}>
        <Tracker />
        <TwoChecksForAccount />
      </Suspense>
      <Suspense fallback={<AccountPanelFallback />}>
        <AccountPanel />
      </Suspense>
    </Page>
  );
}

/**
 * Only a signed-in user gets the two checks: they replace the CV check in their menu. A visitor still has it in the
 * menu, and saw this card above the sign-in card (#548). Reads the session, so render it inside <Suspense>.
 */
async function TwoChecksForAccount() {
  return (await getCurrentUser()) ? <TwoChecks /> : null;
}

/**
 * The two checks answer different questions, and their forms look alike, so each is named by its question. The CV
 * check's question and button are the brand's, as on the home page and Profile (#548). Plain links, so the tracker's
 * own Coral button stays the page's only one.
 */
function TwoChecks() {
  return (
    <Card aria-labelledby="two-checks-heading">
      <h2 id="two-checks-heading" className="text-xl">
        Two different checks
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h3 className="font-semibold">Are you right for this job?</h3>
          <p className="text-text-muted">Paste one job ad and see where your profile already matches it.</p>
          <ButtonLink href="/jobs" className="mt-auto">
            Check a job
          </ButtonLink>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h3 className="font-semibold">{brand.cta.cvCheckQuestion}</h3>
          <p className="text-text-muted">Upload or paste your CV, with no job ad, and see what to fix first.</p>
          <ButtonLink href="/cv-check" className="mt-auto">
            {brand.cta.cvCheckAction}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
