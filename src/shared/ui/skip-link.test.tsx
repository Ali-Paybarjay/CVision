import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkipLink } from "./skip-link";

// Unit tests have no DOM, so the click that focuses the page's <main> is tested in tests/e2e/home.spec.ts.
describe("SkipLink (#507)", () => {
  const html = renderToStaticMarkup(<SkipLink />);

  it("is a link that says where it goes", () => {
    expect(html).toMatch(/^<a [^>]*>Skip to main content<\/a>$/);
  });

  it("is hidden until it has focus, then shows over the header's top-left corner", () => {
    const classes = html.match(/class="([^"]*)"/)?.[1].split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "sr-only",
        "focus:not-sr-only",
        "focus:fixed",
        "focus:top-2",
        "focus:left-2",
        // Above the header, which comes after it and is positioned.
        "focus:z-50",
        // not-sr-only sets padding to 0, so the padding comes with focus: too.
        "focus:px-4",
        "focus:py-2",
        "rounded-md",
        "border",
        "border-line",
        "bg-surface",
        "font-semibold",
        "text-accent",
      ]),
    );
  });
});
