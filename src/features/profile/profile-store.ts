import { useSyncExternalStore } from "react";
import { z } from "zod";
import { DateTimeSchema, ProfileSchema } from "@/shared/contracts";
import { ConsentRecordSchema } from "./consent";

// For now the approved profile lives in the user's browser only. Moving it to the profiles table is a separate card.
// Nothing about the CV is kept on our servers. The user can download or delete it at any time (Your data is yours).

// A copy saved before the follow-up questions were removed also has a "questions" list; reading drops it.
export const StoredProfileSchema = z.object({
  version: z.literal(1),
  profile: ProfileSchema,
  consent: ConsentRecordSchema,
  savedAt: DateTimeSchema,
});
export type StoredProfile = z.infer<typeof StoredProfileSchema>;

export const PROFILE_STORAGE_KEY = "cvision.profile";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ProfileStore = {
  /** The saved profile, or null. Returns the same object until the data changes (for useSyncExternalStore). */
  read(): StoredProfile | null;
  save(value: StoredProfile): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  /** Call when another tab changed the data. */
  notify(): void;
  /** False when the browser blocks storage, as some private windows do: the profile then lasts until the tab closes. */
  readonly persistent: boolean;
};

export function createProfileStore(storage: StorageLike | null): ProfileStore {
  const target = storage !== null && canWrite(storage) ? storage : null;
  let memory: string | null = null;
  let lastRaw: string | null | undefined;
  let lastValue: StoredProfile | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const readRaw = (): string | null => {
    if (!target) return memory;
    try {
      return target.getItem(PROFILE_STORAGE_KEY);
    } catch {
      return memory;
    }
  };

  const writeRaw = (raw: string | null) => {
    memory = raw;
    if (target) {
      try {
        if (raw === null) target.removeItem(PROFILE_STORAGE_KEY);
        else target.setItem(PROFILE_STORAGE_KEY, raw);
      } catch {
        // Storage full or blocked: the copy in memory still works for this tab.
      }
    }
    notify();
  };

  return {
    persistent: target !== null,
    read() {
      const raw = readRaw();
      if (raw !== lastRaw) {
        lastRaw = raw;
        lastValue = parseStored(raw);
      }
      return lastValue;
    },
    save(value) {
      writeRaw(JSON.stringify(StoredProfileSchema.parse(value)));
    },
    clear() {
      writeRaw(null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify,
  };
}

function parseStored(raw: string | null): StoredProfile | null {
  if (raw === null) return null;
  try {
    const result = StoredProfileSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function canWrite(storage: StorageLike): boolean {
  try {
    storage.setItem("cvision.storage-check", "1");
    storage.removeItem("cvision.storage-check");
    return true;
  } catch {
    return false;
  }
}

let browserStore: ProfileStore | undefined;

/** The store for this browser tab. Call only in the browser. */
export function getBrowserProfileStore(): ProfileStore {
  if (!browserStore) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      // Reading localStorage itself throws when the browser blocks site data.
    }
    const store = createProfileStore(storage);
    window.addEventListener("storage", (event) => {
      if (event.key === PROFILE_STORAGE_KEY || event.key === null) store.notify();
    });
    browserStore = store;
  }
  return browserStore;
}

/**
 * The saved profile: undefined while the page is still loading in the browser (and on the server),
 * then the profile or null.
 */
export function useStoredProfile(): StoredProfile | null | undefined {
  return useSyncExternalStore<StoredProfile | null | undefined>(
    (listener) => getBrowserProfileStore().subscribe(listener),
    () => getBrowserProfileStore().read(),
    () => undefined,
  );
}

/** False when this browser blocks storage. Assumed true until the page has loaded. */
export function useStorageIsPersistent(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => getBrowserProfileStore().persistent,
    () => true,
  );
}
