/**
 * The CV file a signed-in user just checked in the free CV check, so Profile can use it without a second upload
 * (#336, from a pilot who had to upload the same CV twice). It lives only in this page's memory: nothing is stored,
 * and a reload, a new tab or closing the tab forgets it. The user still ticks Profile's own consent box before the file
 * is read for their profile.
 *
 * The file is kept with the id of the account that checked it, and only that account's Profile gets it. Signing out
 * in another tab, or a session that ends, doesn't reload this one, so without the id the next account to open Profile
 * here would be offered someone else's CV. Sign-out in this tab also clears it (clearBrowserData).
 *
 * A small store that Profile subscribes to (useSyncExternalStore), so a page Next keeps alive (cacheComponents) shows
 * the latest file, and a cleared file goes from the page at once.
 *
 * Shared because two features meet here: the CV check carries the file, and Profile takes it.
 */
let carried: { file: File; account: string } | null = null;
const listeners = new Set<() => void>();

function set(next: typeof carried): void {
  carried = next;
  for (const listener of listeners) listener();
}

/**
 * Keeps the checked file for this account's Profile. With no file (pasted text) or no account (a visitor, whose file
 * would be lost on the way through sign-up), it forgets any file kept before instead, so that one isn't offered.
 */
export function carryCheckedCv(file: File | null, account: string | null): void {
  set(file && account ? { file, account } : null);
}

/**
 * What the CV check's Tailor button does (#336): carries the checked file for a signed-in account, or, for pasted text
 * or a visitor, forgets any file an earlier check kept. A function of its own so the decision can be tested.
 */
export function carryFromCheck(check: { signedIn: boolean; file: File | null; account: string | null }): void {
  carryCheckedCv(check.signedIn ? check.file : null, check.signedIn ? check.account : null);
}

/** The file kept for this account, or null, including when another account checked it. Reading changes nothing. */
export function carriedCvFor(account: string): File | null {
  return carried && carried.account === account ? carried.file : null;
}

/** Forgets the file: once it is read, on sign-out, or when the user keeps their profile or types it in instead. */
export function clearCarriedCv(): void {
  if (carried) set(null);
}

/** For useSyncExternalStore: calls `listener` whenever the carried file changes. */
export function subscribeCarriedCv(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
