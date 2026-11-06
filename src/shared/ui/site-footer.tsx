import { Suspense } from "react";
import { brand } from "@/shared/brand";
import { cn } from "./cn";
import { FooterNav, FooterNavFallback } from "./footer-nav";
import { wideFrame } from "./page";
import { Wordmark } from "./wordmark";

/** The footer on every page: the wordmark, the tagline and the footer links, such as Privacy. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className={cn("mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-1 px-4 py-4", wideFrame)}>
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
