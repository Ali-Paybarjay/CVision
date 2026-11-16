"use client";

/**
 * "Skip to main content", the first thing Tab reaches on every page, so a keyboard user can pass the header's links
 * (#507). Hidden until it has focus, then over the header's top-left corner. focus:z-50, as the header comes after it
 * and is positioned, so it would be drawn on top; focus:px-4 and focus:py-2, as not-sr-only sets padding to 0.
 */
export function SkipLink() {
  return (
    // The href only puts the link in the Tab order: once the page's script has loaded, a click never follows it
    // (focusMain). A click before that only adds #main to the address, as no element has that id.
    <a
      href="#main"
      onClick={focusMain}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 rounded-md border border-line bg-surface font-semibold text-accent"
    >
      Skip to main content
    </a>
  );
}

/**
 * Focuses the page's <main>: the one on screen, as Next keeps recent pages in the document, hidden (cacheComponents).
 * No #fragment or id: each page's <main> is in its owner's file, and a fragment would add a step to the history,
 * which Back on /cv-check and /interview would spend. A page without a <main>, such as the default 404, keeps focus.
 */
function focusMain(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const main = Array.from(document.querySelectorAll("main")).find((element) => element.getClientRects().length > 0);
  if (!main) return;
  main.tabIndex = -1;
  main.focus();
}
