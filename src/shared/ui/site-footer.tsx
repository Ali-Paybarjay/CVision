import Link from "next/link";
import { brand } from "@/shared/brand";
import { footerItems } from "@/shared/navigation";
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
          <ul className="flex flex-wrap gap-x-6">
            {footerItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
