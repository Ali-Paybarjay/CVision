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

const feedback = vi.hoisted(() => ({ feedbackFormUrl: null as string | null }));
vi.mock("@/shared/feedback", () => feedback);

describe("site footer", () => {
  beforeEach(() => {
    pathname.current = "/";
    feedback.feedbackFormUrl = null;
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

  it("has no Give feedback link until the form's link is set", () => {
    expect(renderToStaticMarkup(<SiteFooter />)).not.toContain("Give feedback");
  });

  it("links to the feedback form in a new tab, and says so to screen readers (#134)", () => {
    feedback.feedbackFormUrl = "https://forms.gle/example";
    const html = renderToStaticMarkup(<SiteFooter />);

    expect(html).toMatch(
      /<a href="https:\/\/forms\.gle\/example" target="_blank" rel="noopener noreferrer"[^>]*>Give feedback<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/,
    );
    // Privacy stays first.
    expect(html.indexOf(">Privacy<")).toBeLessThan(html.indexOf("Give feedback"));
  });
});
