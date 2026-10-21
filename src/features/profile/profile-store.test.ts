import { describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { createProfileStore, PROFILE_STORAGE_KEY, type StoredProfile } from "./profile-store";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const record: StoredProfile = {
  version: 1,
  profile: personas.sara.profile,
  consent: { version: "2026-10-20", givenAt: "2026-10-20T18:00:00.000Z" },
  questions: [],
  savedAt: "2026-10-20T18:05:00.000Z",
};

describe("profile store", () => {
  it("is empty at first, then holds what was saved", () => {
    const store = createProfileStore(memoryStorage());

    expect(store.read()).toBeNull();
    store.save(record);
    expect(store.read()).toEqual(record);
  });

  it("returns the same object until the data changes", () => {
    const store = createProfileStore(memoryStorage());
    store.save(record);

    const first = store.read();
    expect(store.read()).toBe(first);

    store.save({ ...record, savedAt: "2026-10-21T09:00:00.000Z" });
    expect(store.read()).not.toBe(first);
  });

  it("deletes everything on clear", () => {
    const storage = memoryStorage();
    const store = createProfileStore(storage);
    store.save(record);

    store.clear();

    expect(store.read()).toBeNull();
    expect(storage.items.has(PROFILE_STORAGE_KEY)).toBe(false);
  });

  it("tells subscribers about each change", () => {
    const store = createProfileStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.save(record);
    store.clear();
    unsubscribe();
    store.save(record);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores stored data that is damaged or has an old shape", () => {
    const storage = memoryStorage();
    const store = createProfileStore(storage);

    storage.items.set(PROFILE_STORAGE_KEY, "{not json");
    expect(store.read()).toBeNull();

    storage.items.set(PROFILE_STORAGE_KEY, JSON.stringify({ ...record, version: 0 }));
    expect(store.read()).toBeNull();
  });

  it("refuses to save a record that breaks the contract", () => {
    const store = createProfileStore(memoryStorage());
    const broken = { ...record, profile: { ...record.profile, fullName: "" } };
    expect(() => store.save(broken)).toThrow();
  });

  it("keeps the profile for this tab when the browser blocks storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createProfileStore(blocked);

    expect(store.persistent).toBe(false);
    store.save(record);
    expect(store.read()).toEqual(record);
  });
});
