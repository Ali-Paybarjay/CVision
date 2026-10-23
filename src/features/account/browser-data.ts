// CVision's data in the browser: the profile (cvision.profile), interview practice (cvision.interview.v1:<job id>),
// the lab's practice and the storage check. Every key starts with "cvision.", so one prefix clears them all.
export const browserDataPrefix = "cvision.";

type StorageLike = Pick<Storage, "length" | "key" | "removeItem">;

/**
 * Removes every CVision key from this browser's localStorage, on sign-out (issue #35) and after deleting the
 * account (issue #43), so the next person on this browser sees none of it. Other sites' keys stay.
 * Returns how many keys it removed, or null when the browser blocks storage (then nothing was saved either).
 */
export function clearBrowserData(storage?: StorageLike): number | null {
  try {
    const target = storage ?? window.localStorage;
    const keys: string[] = [];
    // Collect first: removing while walking the keys would skip some.
    for (let i = 0; i < target.length; i++) {
      const key = target.key(i);
      if (key?.startsWith(browserDataPrefix)) keys.push(key);
    }
    for (const key of keys) target.removeItem(key);
    return keys.length;
  } catch {
    return null;
  }
}
