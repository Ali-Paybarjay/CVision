import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WaitNote } from "./wait-note";

describe("WaitNote", () => {
  it("keeps an empty live region on the page while nothing runs, so the sentence is read out when it appears", () => {
    expect(renderToStaticMarkup(<WaitNote className="mt-3">{false}</WaitNote>)).toBe('<div aria-live="polite"></div>');
  });

  it("shows the sentence on screen, not only to screen readers, with a ring that stands still for reduced motion", () => {
    const html = renderToStaticMarkup(<WaitNote className="mt-3">Reading your CV. This can take up to a minute.</WaitNote>);

    expect(html).toMatch(/^<div aria-live="polite"><p class="[^"]*mt-3[^"]*">/);
    expect(html).toContain("<span>Reading your CV. This can take up to a minute.</span>");
    expect(html).not.toContain("sr-only");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*class="[^"]*motion-safe:animate-spin/);
  });
});
