import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  it("is decoration beside the wordmark, so screen readers skip it", () => {
    expect(renderToStaticMarkup(<BrandMark />)).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });

  it("uses the icon's own tokens, so dark mode turns the tile Lagoon by itself", () => {
    const html = renderToStaticMarkup(<BrandMark className="size-7" />);

    expect(html).toMatch(/^<svg[^>]*class="shrink-0 size-7"/);
    expect(html).toContain('class="fill-mark"');
    expect(html.match(/class="stroke-on-mark"/g)).toHaveLength(2);
  });

  it("turns into Ink on a White tile on an emphasis section, where Teal would sit on Ink", () => {
    const html = renderToStaticMarkup(<BrandMark tone="on-emphasis" />);

    expect(html).toContain('class="fill-on-emphasis"');
    expect(html.match(/class="stroke-emphasis"/g)).toHaveLength(2);
    expect(html).not.toContain("mark");
  });
});
