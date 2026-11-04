import Link from "next/link";
import { Suspense } from "react";
import { getSignedInUserId } from "@/shared/supabase/session";
import { BrandMark } from "./brand-mark";
import { MainNav, MainNavFallback } from "./main-nav";
import { Wordmark } from "./wordmark";

export function SiteHeader() {
  return (
    <header className="relative border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4 lg:gap-8">
        <Link href="/" className="flex items-center gap-2 text-xl" aria-label="CVision home">
          {/* The icon joins the wordmark from 640px: on a phone the header button needs the room (#177). */}
          <BrandMark className="hidden size-7 sm:block" />
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
