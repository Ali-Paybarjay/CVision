import { describe, expect, it } from "vitest";
import { clearBrowserData } from "./browser-data";

/** Just enough of localStorage: keys in the order they were set, like a browser. */
function fakeStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("clearBrowserData", () => {
  it("removes every CVision key and keeps everything else", () => {
    const storage = fakeStorage({
      "cvision.profile": "{}",
      "other-site.theme": "dark",
      "cvision.interview.v1:0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10": "{}",
      "cvision.interview.v1:sara-job-2": "{}",
      cvisionish: "not ours",
      "cvision.interview-lab.v1": "{}",
    });

    expect(clearBrowserData(storage)).toBe(4);
    expect([...storage.items.keys()]).toEqual(["other-site.theme", "cvisionish"]);
  });

  it("does nothing when there is nothing to clear", () => {
    const storage = fakeStorage({ "other-site.theme": "dark" });

    expect(clearBrowserData(storage)).toBe(0);
    expect(storage.items.size).toBe(1);
  });

  it("returns null instead of throwing when the browser blocks storage", () => {
    const blocked = {
      get length(): number {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
      key: () => null,
      removeItem: () => {},
    };

    expect(clearBrowserData(blocked)).toBeNull();
  });

  it("returns null outside a browser", () => {
    expect(clearBrowserData()).toBeNull();
  });
});
