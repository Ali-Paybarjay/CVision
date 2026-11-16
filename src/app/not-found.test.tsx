import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NotFound, { metadata } from "./not-found";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Each link's address and words, in page order. */
const links = (html: string) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(([, href, text]) => ({ href, text }));

describe("the not-found page (#508)", () => {
  const html = renderToStaticMarkup(<NotFound />);

  it("says the page is missing, in one heading and in the tab's title", () => {
    expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/g)).toEqual([expect.stringContaining(">We could not find this page</h1>")]);
    expect(html).toContain("The link may be wrong, or the page may have moved.");
    expect(metadata.title).toBe("Page not found");
  });

  it("leads home with the one Coral button, and on to the dashboard", () => {
    expect(links(html)).toEqual([
      { href: "/", text: "Go to the home page" },
      { href: "/dashboard", text: "Go to your dashboard" },
    ]);
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/" class="[^"]*bg-cta[^"]*">Go to the home page<\/a>/);
  });
});
