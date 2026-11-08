"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * The pages visited in this tab inside the app, so a Back link can go back to the page the user came from, as the
 * browser's Back button does, even in a browser without the Navigation API (navigation.canGoBack). Without it, Back
 * fell back to a fixed page, which a pilot noticed (8 November). Only paths, only in this tab's memory: nothing is
 * stored, and a reload starts afresh.
 */
const visited: string[] = [];

/**
 * Notes that the tab is now on `path`. Going to the page before the last one counts as going back, so the list stays
 * the way back rather than every page ever opened.
 */
export function recordInAppPage(path: string, pages: string[] = visited): void {
  if (pages.at(-1) === path) return;
  if (pages.at(-2) === path) pages.pop();
  else pages.push(path);
}

/** True when the page before this one in the tab is also a page of this app. */
export function cameFromThisApp(pages: string[] = visited): boolean {
  return pages.length > 1;
}

/** Renders nothing: records each page the tab shows. In the root layout, once. */
export function InAppHistory() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordInAppPage(pathname);
  }, [pathname]);
  return null;
}
