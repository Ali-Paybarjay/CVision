import { Suspense } from "react";
import { brand } from "@/shared/brand";
import { FooterNav, FooterNavFallback } from "./footer-nav";
import { Wordmark } from "./wordmark";

/** The footer on every page: the wordmark, the tagline and the footer links, such as Privacy. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-1 px-4 py-4">
        <p className="text-sm text-text-muted">
          <Wordmark className="text-base" /> {brand.tagline}
        </p>
        <nav aria-label="Footer">
          {/* With Cache Components, usePathname can suspend on a page whose param is only known at request time. */}
          <Suspense fallback={<FooterNavFallback />}>
            <FooterNav />
          </Suspense>
        </nav>
      </div>
    </footer>
  );
}
