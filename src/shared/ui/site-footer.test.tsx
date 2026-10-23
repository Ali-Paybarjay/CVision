import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("site footer", () => {
  beforeEach(() => {
    pathname.current = "/";
  });

  it("links to Privacy from a labelled footer menu", () => {
    const html = renderToStaticMarkup(<SiteFooter />);

    expect(html).toMatch(/^<footer/);
    expect(html).toContain('<nav aria-label="Footer">');
    expect(html).toMatch(/<a href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(html).not.toContain("aria-current");
  });

  it("marks the Privacy link as the current page on /privacy", () => {
    pathname.current = "/privacy";
    const html = renderToStaticMarkup(<SiteFooter />);

    expect(html).toMatch(/<a href="\/privacy" aria-current="page"[^>]*>Privacy<\/a>/);
  });
});
