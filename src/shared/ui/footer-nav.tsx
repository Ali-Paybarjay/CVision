"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { footerItems } from "@/shared/navigation";
import { cn } from "./cn";

/** The same rule as the top menu: the page itself or any page below it. */
function isCurrent(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

function FooterLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex flex-wrap gap-x-6">
      {footerItems.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline",
                current && "underline",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Before the pathname is known (prerendering a page with an unknown param), the same links without the current-page mark. */
export function FooterNavFallback() {
  return <FooterLinks pathname={null} />;
}

/** The footer links, marking the page you're on, as the top menu does. */
export function FooterNav() {
  return <FooterLinks pathname={usePathname()} />;
}
