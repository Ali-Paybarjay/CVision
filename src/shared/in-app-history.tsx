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
 * Notes that the tab is now on `path`. Going to a page already in the list counts as going back to it, however many
 * pages back (a long press on the browser's Back can jump several at once, which the batch review found): the list
 * is cut back to it, so it stays the way back rather than every page ever opened. A link forward to a page opened
 * earlier is cut back too, which only makes Back follow its fixed link instead: it can never leave the app.
 */
export function recordInAppPage(path: string, pages: string[] = visited): void {
  const earlier = pages.lastIndexOf(path);
  if (earlier >= 0) pages.splice(earlier + 1);
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
