import Link from "next/link";
import { Suspense } from "react";
import { getSignedInUserId } from "@/shared/supabase/session";
import { BrandMark } from "./brand-mark";
import { cn } from "./cn";
import { MainNav, MainNavFallback } from "./main-nav";
import { wideFrame } from "./page";
import { Wordmark } from "./wordmark";

/** `signOut` is the Sign out control, shown to signed-in visitors (#328). The layout passes it in, so @/shared stays free of @/features. */
export function SiteHeader({ signOut }: { signOut?: React.ReactNode }) {
  return (
    <header className="relative border-b border-line bg-surface">
      <nav aria-label="Main" className={cn("mx-auto flex min-h-16 items-center gap-4 px-4 lg:gap-8", wideFrame)}>
        <Link href="/" className="flex items-center gap-2 text-xl" aria-label="CVision home">
          {/* The icon joins the wordmark from 640px: on a phone the header button needs the room (#177). */}
          <BrandMark className="hidden size-7 sm:block" />
          <Wordmark />
        </Link>
        <Suspense fallback={<MainNavFallback />}>
          <SessionAwareNav signOut={signOut} />
        </Suspense>
      </nav>
    </header>
  );
}

/** Reads the session, so it streams in behind the Suspense boundary above. */
async function SessionAwareNav({ signOut }: { signOut?: React.ReactNode }) {
  return <MainNav signedIn={(await getSignedInUserId()) !== null} signOut={signOut} />;
}
