"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navItems } from "@/shared/navigation";
import { cn } from "./cn";
import { CloseIcon, MenuIcon } from "./icons";

const links = navItems.filter((item) => item.href !== "/");

function isCurrent(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

function NavLinks({ pathname, onNavigate, className }: { pathname: string | null; onNavigate?: () => void; className?: string }) {
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
    </ul>
  );
}

/** Before the pathname is known (prerendering), the same links without the current-page mark. */
export function MainNavFallback() {
  return <NavLinks pathname={null} className="hidden items-center gap-5 md:flex" />;
}

export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <NavLinks pathname={pathname} className="hidden items-center gap-5 md:flex" />
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold md:hidden"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
        Menu
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-surface px-4 pb-3 md:hidden">
          <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} className="flex flex-col" />
        </div>
      )}
    </>
  );
}
