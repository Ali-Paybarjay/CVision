/**
 * The CV file a signed-in user just checked in the free CV check, so Profile can use it without a second upload
 * (#336, from a pilot who had to upload the same CV twice). It lives only in this page's memory: nothing is stored,
 * and a reload, a new tab or closing the tab forgets it. The user still ticks Profile's own consent box before the file
 * is read for their profile.
 *
 * Shared because two features meet here: the CV check carries the file, and Profile takes it.
 */
let carried: File | null = null;

/** Keeps the checked file for Profile, replacing any file kept before. */
export function carryCv(file: File): void {
  carried = file;
}

/** The file the CV check kept, or null. Reading it does not clear it, so a component rendered twice still sees it. */
export function carriedCv(): File | null {
  return carried;
}

/** Forgets the file: once Profile has read it, or the user has chosen to keep their current profile. */
export function clearCarriedCv(): void {
  carried = null;
}
