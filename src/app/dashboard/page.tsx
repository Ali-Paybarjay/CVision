import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPanel, AccountPanelFallback } from "@/features/account/account-panel";
import { Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Page title="Dashboard" description="Your applications and next steps will appear here." width="wide">
      <Suspense fallback={<AccountPanelFallback />}>
        <AccountPanel />
      </Suspense>
    </Page>
  );
}
