import Link from "next/link";
import { Suspense } from "react";
import { MainNav, MainNavFallback } from "./main-nav";
import { Wordmark } from "./wordmark";

export function SiteHeader() {
  return (
    <header className="relative border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-6 px-4">
        <Link href="/" className="text-xl" aria-label="CVision home">
          <Wordmark />
        </Link>
        <Suspense fallback={<MainNavFallback />}>
          <MainNav />
        </Suspense>
      </nav>
    </header>
  );
}
