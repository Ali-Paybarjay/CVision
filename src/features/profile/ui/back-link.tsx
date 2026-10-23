"use client";

import Link from "next/link";

type BackLinkProps =
  /** A step inside the page: goes back to the step before it. */
  | { onClick: () => void }
  /**
   * The page itself: goes back to the page before, as the browser's Back button does, when that page is on this
   * site. Otherwise (a new tab, or a link from somewhere else) it opens `href`.
   */
  | { href: string };

const style =
  "inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-accent underline-offset-4 hover:underline";

/** "Back" with an arrow, at the top of each page and step, so the user can always go back. */
export function BackLink(props: BackLinkProps) {
  if ("onClick" in props) {
    return (
      <button type="button" onClick={props.onClick} className={style}>
        <ArrowIcon />
        Back
      </button>
    );
  }
  return (
    <Link
      href={props.href}
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

/** Browsers without the Navigation API can't say, so the link then opens its own address. */
function previousPageIsOnThisSite(): boolean {
  const { navigation } = window as Window & { navigation?: { canGoBack: boolean } };
  return navigation?.canGoBack === true;
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
