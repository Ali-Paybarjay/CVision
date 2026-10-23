import { describe, expect, it } from "vitest";
import { browserDataFile, clearBrowserData, readBrowserData } from "./browser-data";

/** Just enough of localStorage: keys in the order they were set, like a browser. */
function fakeStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => void items.delete(key),
  };
}

const blocked = {
  get length(): number {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  key: () => null,
  getItem: () => null,
  removeItem: () => {},
};

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
    expect(clearBrowserData(blocked)).toBeNull();
  });

  it("returns null outside a browser", () => {
    expect(clearBrowserData()).toBeNull();
  });
});

describe("readBrowserData", () => {
  it("reads every CVision key with its value, in key order, without the storage check", () => {
    const storage = fakeStorage({
      "cvision.profile": '{"name":"Sara"}',
      "other-site.theme": "dark",
      "cvision.storage-check": "1",
      "cvision.interview.v1:sara-job-2": '{"answers":[]}',
    });

    expect(readBrowserData(storage)).toEqual([
      ["cvision.interview.v1:sara-job-2", '{"answers":[]}'],
      ["cvision.profile", '{"name":"Sara"}'],
    ]);
  });

  it("finds nothing when the browser blocks storage, or outside a browser", () => {
    expect(readBrowserData(blocked)).toEqual([]);
    expect(readBrowserData()).toEqual([]);
  });
});

describe("browserDataFile", () => {
  it("saves each key with its value, parsed when it is JSON, in a dated file", () => {
    const file = browserDataFile(
      [
        ["cvision.interview.v1:sara-job-2", '{"answers":[]}'],
        ["cvision.profile", "not json"],
      ],
      new Date("2026-10-23T10:00:00Z"),
    );

    expect(file.fileName).toBe("cvision-browser-data-2026-10-23.json");
    const json = JSON.parse(file.json);
    expect(json.exportedAt).toBe("2026-10-23T10:00:00.000Z");
    expect(json.about).toContain("not in your account");
    expect(json.items).toEqual({ "cvision.interview.v1:sara-job-2": { answers: [] }, "cvision.profile": "not json" });
  });
});
