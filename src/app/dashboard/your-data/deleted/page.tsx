import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountDeleted, AccountDeletedFallback } from "@/features/account/account-deleted";

export const metadata: Metadata = { title: "Account deleted" };

// Where "Delete my account" lands (issue #43). The whole page waits for the check that this browser has just deleted
// its account, so nobody else sees it or has their browser's data cleared, even for a moment.
export default function AccountDeletedPage() {
  return (
    <Suspense fallback={<AccountDeletedFallback />}>
      <AccountDeleted />
    </Suspense>
  );
}
