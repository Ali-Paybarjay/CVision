import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountDeleted, AccountDeletedFallback } from "@/features/account/account-deleted";

export const metadata: Metadata = { title: "Account deleted" };

// Where "Delete my account" lands (issue #43). The whole page waits for the session check, so nobody still signed
// in sees it, even for a moment.
export default function AccountDeletedPage() {
  return (
    <Suspense fallback={<AccountDeletedFallback />}>
      <AccountDeleted />
    </Suspense>
  );
}
