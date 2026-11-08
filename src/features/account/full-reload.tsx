"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fullReloadField } from "./full-reload-field";

/**
 * Signing in, signing out and deleting the account end in a full page load, not Next's in-app navigation (#350).
 * Next keeps recent pages alive with their state (cacheComponents), so after an in-app navigation the next person in
 * this tab could find the last account's CV check report, form fields or profile still there. A full load starts the
 * tab afresh, as Next's guide ("Preserving UI state: State and authentication") advises for these moments.
 *
 * Without JavaScript the form posts natively and the server's redirect is already a full load. With JavaScript, the
 * form sends this field, and the action returns where to go instead of redirecting; useFullReload then loads it.
 */
const neverChanges = () => () => {};

/** The hidden field that asks the action for a full load. Rendered only once JavaScript runs in this browser. */
export function FullReloadField() {
  const hydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
  return hydrated ? <input type="hidden" name={fullReloadField} value="1" /> : null;
}

/** Loads `path` as a new page once the action has said where to go. */
export function useFullReload(path: string | undefined): void {
  useEffect(() => {
    if (path) window.location.assign(path);
  }, [path]);
}
