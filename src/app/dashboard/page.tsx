import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPanel, AccountPanelFallback } from "@/features/account/account-panel";
import { Tracker, TrackerFallback } from "@/features/tracker/tracker";
import { Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Page title="Dashboard" description="Every job you have applied for, where it stands and what to do next." width="wide">
      <Suspense fallback={<TrackerFallback />}>
        <Tracker />
      </Suspense>
      <Suspense fallback={<AccountPanelFallback />}>
        <AccountPanel />
      </Suspense>
    </Page>
  );
}
