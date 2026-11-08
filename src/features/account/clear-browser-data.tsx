"use client";

import { useEffect } from "react";
import { clearBrowserData } from "./browser-data";

/**
 * Clears CVision's data from this browser as soon as the page shows. Renders nothing. Used on the page after
 * "Delete my account".
 *
 * That page is reached by the delete action's redirect, an in-app navigation, and Next keeps recent pages alive with
 * their state (cacheComponents), so the deleted account's CV check report or form could still be there for the next
 * person in this tab (#350). So when the page was reached that way, it loads itself again as a new page. The
 * document's own address then is this page, so it happens once; opening the page directly doesn't reload it.
 */
export function ClearBrowserData() {
  useEffect(() => {
    clearBrowserData();
    if (reachedInApp()) window.location.replace(window.location.href);
  }, []);
  return null;
}

/** True when this page was reached by an in-app navigation: the document was first loaded at another address. */
export function reachedInApp(
  entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined,
  here: string = window.location.href,
): boolean {
  if (!entry) return false;
  return new URL(entry.name).pathname !== new URL(here).pathname;
}
