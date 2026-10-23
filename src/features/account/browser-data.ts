// CVision's data in the browser: the profile (cvision.profile), interview practice (cvision.interview.v1:<job id>),
// the lab's practice and the storage check. Every key starts with "cvision.", so one prefix finds them all.
import { brand } from "@/shared/brand";

export const browserDataPrefix = "cvision.";

/** Written and removed at once to test whether storage works; it never holds the user's data. */
const storageCheckKey = `${browserDataPrefix}storage-check`;

type StorageLike = Pick<Storage, "length" | "key" | "removeItem">;
type ReadableStorage = Pick<Storage, "length" | "key" | "getItem">;

/**
 * Removes every CVision key from this browser's localStorage, on sign-out (issue #35) and after deleting the
 * account (issue #43), so the next person on this browser sees none of it. Other sites' keys stay.
 * Returns how many keys it removed, or null when the browser blocks storage (then nothing was saved either).
 */
export function clearBrowserData(storage?: StorageLike): number | null {
  try {
    const target = storage ?? window.localStorage;
    const keys = cvisionKeys(target);
    for (const key of keys) target.removeItem(key);
    return keys.length;
  } catch {
    return null;
  }
}

/**
 * The user's CVision data saved only in this browser, as [key, value] pairs in key order: what the account's
 * download cannot include (issue #43). Empty when there is none or the browser blocks storage.
 */
export function readBrowserData(storage?: ReadableStorage): [string, string][] {
  try {
    const source = storage ?? window.localStorage;
    return cvisionKeys(source)
      .filter((key) => key !== storageCheckKey)
      .sort()
      .flatMap((key) => {
        const value = source.getItem(key);
        return value === null ? [] : [[key, value] as [string, string]];
      });
  } catch {
    return [];
  }
}

/** The JSON file "Download this browser's data" saves: each key with its value, parsed when it is JSON. */
export function browserDataFile(entries: [string, string][], now: Date) {
  const exportedAt = now.toISOString();
  const items = Object.fromEntries(entries.map(([key, value]) => [key, parseOrKeep(value)]));
  const about = `${brand.name} data saved only in this browser, such as a profile or interview practice, by its storage key. It is not in your account, so the account's download does not include it.`;
  return {
    fileName: `cvision-browser-data-${exportedAt.slice(0, 10)}.json`,
    json: `${JSON.stringify({ about, exportedAt, items }, null, 2)}\n`,
  };
}

function cvisionKeys(storage: Pick<Storage, "length" | "key">): string[] {
  // Collect first: removing while walking the keys would skip some.
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(browserDataPrefix)) keys.push(key);
  }
  return keys;
}

function parseOrKeep(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
