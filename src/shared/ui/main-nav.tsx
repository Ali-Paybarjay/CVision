"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { trackHomeCtaClick } from "@/shared/analytics/actions";
import { brand } from "@/shared/brand";
import { navItems } from "@/shared/navigation";
import { ButtonLink } from "./button";
import { cn } from "./cn";
import { CloseIcon, MenuIcon } from "./icons";

const links = navItems.filter((item) => item.href !== "/");

function isCurrent(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

function NavLinks({
  pathname,
  onNavigate,
  className,
  children,
}: {
  pathname: string | null;
  onNavigate?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <ul className={className}>
      {links.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={cn(
                "block py-2 text-sm hover:text-accent",
                current ? "font-semibold text-text underline decoration-fit-bar decoration-2 underline-offset-8" : "text-text-muted",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
      {children}
    </ul>
  );
}

/** Before the pathname and session are known (prerendering), the same links without the current-page mark. */
export function MainNavFallback() {
  return <NavLinks pathname={null} className="hidden items-center gap-5 md:flex" />;
}

/**
 * The top menu. Signed-out visitors also get Sign in and the main call to action,
 * as a secondary button so the page's own Coral button stays the only one.
 */
export function MainNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const showSignIn = !signedIn && !isCurrent(pathname, "/sign-in");
  const showGetStarted = !signedIn && !isCurrent(pathname, "/sign-up");

  return (
    <>
      <NavLinks pathname={pathname} className="hidden items-center gap-5 md:flex" />
      <div className="ml-auto flex items-center gap-3">
        {showSignIn && (
          <Link href="/sign-in" className="hidden py-2 text-sm font-semibold text-accent hover:underline sm:block">
            Sign in
          </Link>
        )}
        {showGetStarted && (
          <ButtonLink
            href="/sign-up"
            onClick={() => {
              if (pathname === "/") trackHomeCtaClick({ cta: "get_started", placement: "header" }).catch(() => {});
            }}
          >
            {brand.cta.primary}
          </ButtonLink>
        )}
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
          <span className="sr-only sm:not-sr-only">Menu</span>
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-surface px-4 pb-3 md:hidden">
          <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} className="flex flex-col">
            {showSignIn && (
              <li className="sm:hidden">
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-semibold text-accent hover:underline"
                >
                  Sign in
                </Link>
              </li>
            )}
          </NavLinks>
        </div>
      )}
    </>
  );
}
