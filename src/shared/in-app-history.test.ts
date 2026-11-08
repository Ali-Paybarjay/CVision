import { describe, expect, it } from "vitest";
import { cameFromThisApp, recordInAppPage } from "./in-app-history";

describe("in-app history", () => {
  it("says there is a page to go back to only after the tab has moved inside the app", () => {
    const pages: string[] = [];
    recordInAppPage("/cv-check", pages);
    expect(cameFromThisApp(pages)).toBe(false);
    recordInAppPage("/cv-check", pages); // the same page again: no change
    expect(cameFromThisApp(pages)).toBe(false);
    recordInAppPage("/interview", pages);
    expect(cameFromThisApp(pages)).toBe(true);
  });

  // Without this, Back from the first page after going back would go to another website.
  it("treats returning to the page before as going back, so Back can't leave the app", () => {
    const pages: string[] = [];
    recordInAppPage("/dashboard", pages);
    recordInAppPage("/interview", pages);
    recordInAppPage("/dashboard", pages);
    expect(pages).toEqual(["/dashboard"]);
    expect(cameFromThisApp(pages)).toBe(false);
  });

  it("keeps the way back through several pages", () => {
    const pages: string[] = [];
    for (const path of ["/", "/cv-check", "/profile", "/jobs"]) recordInAppPage(path, pages);
    recordInAppPage("/profile", pages);
    expect(pages).toEqual(["/", "/cv-check", "/profile"]);
    expect(cameFromThisApp(pages)).toBe(true);
  });
});
