import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import { MainNav } from "./main-nav";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/shared/analytics/actions", () => ({ trackHomeCtaClick: async () => {} }));

/** The class of the page-link list and of the Menu button. */
function layout(html: string) {
  return {
    links: html.match(/<ul class="([^"]*)"/)?.[1].split(" ") ?? [],
    menu: html.match(/<button[^>]*class="([^"]*)"[^>]*aria-controls="mobile-menu"/)?.[1].split(" ") ?? [],
  };
}

describe("Sign out in the top menu (#328)", () => {
  const signOut = <button type="submit">Sign out</button>;

  it("signed in: shows the Sign out control the layout passes in, beside the page links from 768px", () => {
    const html = renderToStaticMarkup(<MainNav signedIn signOut={signOut} />);
    expect(html).toContain('<div class="hidden md:block"><button type="submit">Sign out</button></div>');
  });

  it("signed out: no Sign out control", () => {
    expect(renderToStaticMarkup(<MainNav signedIn={false} signOut={signOut} />)).not.toContain("Sign out");
  });
});

describe("top menu (#177)", () => {
  it("signed out: makes room for the call to action by moving the page links into the Menu below 1024px", () => {
    const html = renderToStaticMarkup(<MainNav signedIn={false} />);
    const { links, menu } = layout(html);

    expect(html).toContain(`>${brand.cta.primary}</a>`);
    expect(links).toContain("lg:flex");
    expect(links).not.toContain("md:flex");
    expect(menu).toContain("lg:hidden");
  });

  it("signed in: no call to action, so the page links stay inline from 768px", () => {
    const html = renderToStaticMarkup(<MainNav signedIn />);
    const { links, menu } = layout(html);

    expect(html).not.toContain(brand.cta.primary);
    expect(links).toContain("md:flex");
    expect(links).not.toContain("lg:flex");
    expect(menu).toContain("md:hidden");
    expect(menu).not.toContain("lg:hidden");
  });
});
