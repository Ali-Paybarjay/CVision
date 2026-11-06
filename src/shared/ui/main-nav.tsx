"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  return <NavLinks pathname={null} className="hidden items-center gap-5 lg:flex" />;
}

/**
 * The top menu. Signed-out visitors also get Sign in and the main call to action,
 * as a secondary button so the page's own Coral button stays the only one.
 * The call to action keeps its one name everywhere, so the menu makes room for it instead (#177): for signed-out
 * visitors the page links move into the Menu below 1024px, and the button is compact and stays on one line on a
 * 360px phone. Signed-in visitors have no call to action here, so they keep the page links from 768px.
 * `signOut` is the Sign out control (from @/features/account, passed in by the layout): signed-in visitors get it
 * after the page links, in the Menu on a phone (#328).
 */
export function MainNav({ signedIn, signOut }: { signedIn: boolean; signOut?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // A new page closes the menu, however the visitor got there: the logo, the header button, a link on the page, or
  // Back (#302). The header stays in the layout from page to page, so its state would otherwise outlive the page.
  const [shownOn, setShownOn] = useState(pathname);
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setOpen(false);
  }

  // Escape, or a tap anywhere but the menu and its button, closes it too. The tap still reaches what it was on.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Focus inside the menu goes back to the button that opened it, so a keyboard user is not left nowhere.
      if (panel.current?.contains(document.activeElement)) button.current?.focus();
      setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && (panel.current?.contains(target) || button.current?.contains(target))) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const showSignIn = !signedIn && !isCurrent(pathname, "/sign-in");
  const showGetStarted = !signedIn && !isCurrent(pathname, "/sign-up");
  // Whole class names, so Tailwind finds them: page links inline from md when signed in, from lg when signed out.
  const wide = signedIn ? { links: "md:flex", narrowOnly: "md:hidden" } : { links: "lg:flex", narrowOnly: "lg:hidden" };

  return (
    <>
      <NavLinks pathname={pathname} className={cn("hidden items-center gap-5", wide.links)} />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {signedIn && signOut && <div className="hidden md:block">{signOut}</div>}
        {showSignIn && (
          <Link href="/sign-in" className="hidden py-2 text-sm font-semibold text-accent hover:underline sm:block">
            Sign in
          </Link>
        )}
        {showGetStarted && (
          <ButtonLink
            href="/sign-up"
            size="compact"
            onClick={() => {
              if (pathname === "/") trackHomeCtaClick({ cta: "get_started", placement: "header" }).catch(() => {});
            }}
          >
            {brand.cta.primary}
          </ButtonLink>
        )}
        <button
          ref={button}
          type="button"
          className={cn(
            // Under the pointer it shows it can be clicked, as the other header controls do (#277).
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold transition-colors hover:bg-canvas hover:text-accent",
            wide.narrowOnly,
          )}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
          <span className="sr-only sm:not-sr-only">Menu</span>
        </button>
      </div>
      {open && (
        <div
          ref={panel}
          id="mobile-menu"
          // Its own layer, above anything positioned on the page, such as Tailor's steps (#298).
          className={cn("absolute inset-x-0 top-full z-20 border-b border-line bg-surface px-4 pb-3", wide.narrowOnly)}
        >
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
            {/* Not closed on click: that would remove the form before it posts. Signing out opens another page. */}
            {signedIn && signOut && <li>{signOut}</li>}
          </NavLinks>
        </div>
      )}
    </>
  );
}
