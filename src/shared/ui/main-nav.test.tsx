import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import { MainNav, MainNavFallback } from "./main-nav";

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

describe("CV check in the top menu", () => {
  /** The page links in the inline list, in order. */
  function pageLinks(html: string) {
    const list = html.match(/<ul class="[^"]*">(.*?)<\/ul>/)?.[1] ?? "";
    return [...list.matchAll(/<a href="([^"]*)"/g)].map((match) => match[1]);
  }

  it("signed in: only the user's path, with no CV check beside Check a job", () => {
    expect(pageLinks(renderToStaticMarkup(<MainNav signedIn />))).toEqual([
      "/dashboard",
      "/profile",
      "/jobs",
      "/tailor",
      "/interview",
    ]);
  });

  it("signed out: the free CV check stays in the menu, after the path", () => {
    expect(pageLinks(renderToStaticMarkup(<MainNav signedIn={false} />))).toEqual([
      "/dashboard",
      "/profile",
      "/jobs",
      "/tailor",
      "/interview",
      "/cv-check",
    ]);
  });

  // The fallback showed the visitor's CV check, so a signed-in user saw it flash and go on every full load (#548).
  it("before the session is read: only the links both menus share, so nothing flashes and goes", () => {
    const fallback = pageLinks(renderToStaticMarkup(<MainNavFallback />));
    expect(fallback).toEqual(pageLinks(renderToStaticMarkup(<MainNav signedIn />)));
    expect(fallback).not.toContain("/cv-check");
    // A visitor's menu only adds the CV check at the end, so no link before it moves.
    expect(pageLinks(renderToStaticMarkup(<MainNav signedIn={false} />)).slice(0, fallback.length)).toEqual(fallback);
  });
});

describe("top menu (#177)", () => {
  it("signed out: makes room for the call to action by moving the page links into the Menu below 1024px", () => {
    const html = renderToStaticMarkup(<MainNav signedIn={false} />);
    const { links, menu } = layout(html);

    // Sign-up, then the profile, also from the confirmation email (#507).
    expect(html.match(/<a href="\/sign-up\?next=%2Fprofile"[^>]*>([^<]*)<\/a>/)?.[1]).toBe(brand.cta.primary);
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
