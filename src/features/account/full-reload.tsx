"use client";

import { useMemo, useSyncExternalStore } from "react";
import { fullReloadField } from "./full-reload-field";

/**
 * Signing in, signing out and deleting the account end in a full page load, not Next's in-app navigation (#350).
 * Next keeps recent pages alive with their state (cacheComponents), so after an in-app navigation the next person in
 * this tab could find the last account's CV check report, form fields or profile still there. A full load starts the
 * tab afresh, as Next's guide ("Preserving UI state: State and authentication") advises for these moments.
 *
 * Without JavaScript the form posts natively and the server's redirect is already a full load. With JavaScript, the
 * form sends this field, and the action returns where to go instead of redirecting; withFullReload then loads it.
 */
const neverChanges = () => () => {};

/** False on the server and while the page hydrates, true once JavaScript runs in this browser. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/** The hidden field that asks the action for a full load. Rendered only once JavaScript runs in this browser. */
export function FullReloadField() {
  return useHydrated() ? <input type="hidden" name={fullReloadField} value="1" /> : null;
}

/**
 * The action to give useActionState. On the server and until the page hydrates it is the server action itself, so the
 * form still posts without JavaScript (React can only post a Server Function natively). Once JavaScript runs it is
 * the same action wrapped by withFullReload, in step with FullReloadField, which asks the action for `go`.
 */
export function useFullReloadAction<State extends { go?: string }>(
  act: (state: State, formData: FormData) => Promise<State>,
): (state: State, formData: FormData) => Promise<State> {
  const hydrated = useHydrated();
  const reloading = useMemo(() => withFullReload(act), [act]);
  return hydrated ? reloading : act;
}

/**
 * Wraps an action for useActionState so that, once it says where to go, that page loads as a new page.
 *
 * The load happens here, as the action's call returns, not in an effect of the form: signing in or out writes the
 * session cookies, so Next rebuilds the page in the same response, and the form is gone from the new page (Sign in
 * becomes "You're already signed in", the header's Sign out goes). An effect in it would never run, which the batch
 * review of #366 found (#387).
 */
export function withFullReload<State extends { go?: string }>(
  act: (state: State, formData: FormData) => Promise<State>,
  load: (path: string) => void = (path) => window.location.assign(path),
): (state: State, formData: FormData) => Promise<State> {
  return async (state, formData) => {
    const next = await act(state, formData);
    if (next.go) load(next.go);
    return next;
  };
}
