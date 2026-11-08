"use client";

import Link from "next/link";
import { cameFromThisApp } from "@/shared/in-app-history";

type BackLinkProps = {
  /**
   * Goes back to the page before, as the browser's Back button does, when that page is on this site. Otherwise (a new
   * tab, or a link from somewhere else) it opens `href`.
   */
  href: string;
};

const style =
  "inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-accent underline-offset-4 hover:underline";

/** "Back" with an arrow, at the top of a page. Profile and Jobs have none: their steps bar and the menu lead out. */
export function BackLink({ href }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={style}
      onNavigate={(event) => {
        if (!previousPageIsOnThisSite()) return;
        event.preventDefault();
        window.history.back();
      }}
    >
      <ArrowIcon />
      Back
    </Link>
  );
}

/**
 * The Navigation API says so where the browser has it. Elsewhere the app's own record of this tab's pages answers, so
 * Back still goes to the page the user came from rather than a fixed page (a pilot noticed, 8 November).
 */
function previousPageIsOnThisSite(): boolean {
  const { navigation } = window as Window & { navigation?: { canGoBack: boolean } };
  return navigation ? navigation.canGoBack === true : cameFromThisApp();
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}
