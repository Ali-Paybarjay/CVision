import Link from "next/link";
import { Suspense } from "react";
import { getSignedInUserId } from "@/shared/supabase/session";
import { MainNav, MainNavFallback } from "./main-nav";
import { Wordmark } from "./wordmark";

export function SiteHeader() {
  return (
    <header className="relative border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex min-h-16 max-w-6xl items-center gap-8 px-4">
        <Link href="/" className="text-xl" aria-label="CVision home">
          <Wordmark />
        </Link>
        <Suspense fallback={<MainNavFallback />}>
          <SessionAwareNav />
        </Suspense>
      </nav>
    </header>
  );
}

/** Reads the session, so it streams in behind the Suspense boundary above. */
async function SessionAwareNav() {
  return <MainNav signedIn={(await getSignedInUserId()) !== null} />;
}
