import { describe, expect, it } from "vitest";
import { reachedInApp } from "./clear-browser-data";

// The page after "Delete my account" loads itself again when it was reached in-app, so no page Next kept alive from
// the deleted account survives in the tab (#350), and only once.
describe("reachedInApp", () => {
  const entry = (name: string) => ({ name }) as PerformanceNavigationTiming;
  const deleted = "https://cvision-eta.vercel.app/dashboard/your-data/deleted";

  it("is true when the document was first loaded at another page, as after the delete action's redirect", () => {
    expect(reachedInApp(entry("https://cvision-eta.vercel.app/dashboard/your-data"), deleted)).toBe(true);
  });

  it("is false once the page has loaded itself, so it reloads only once", () => {
    expect(reachedInApp(entry(deleted), deleted)).toBe(false);
  });

  it("ignores the query and the hash, and is false with no navigation entry", () => {
    expect(reachedInApp(entry(`${deleted}?x=1`), `${deleted}#top`)).toBe(false);
    expect(reachedInApp(undefined, deleted)).toBe(false);
  });
});
