import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import GlobalError from "./global-error";

// next/font/local only works inside Next's build (its package file is empty), so the font is a stand-in here.
vi.mock("./fonts/inter", () => ({ inter: { variable: "inter-font-variable" } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("the global error page, for an error in the root layout (#508)", () => {
  const html = renderToStaticMarkup(<GlobalError error={new Error("The layout broke")} retry={() => {}} />);

  it("brings its own document in UK English, with the layout's font and classes", () => {
    expect(html).toContain('<html lang="en-GB" class="inter-font-variable h-full antialiased">');
    expect(html).toContain('<body class="flex min-h-full flex-col">');
  });

  it("names the tab in one string, so React keeps the title", () => {
    expect(html).toContain(`<title>Something went wrong | ${brand.name}</title>`);
  });

  it("shows the error page, with its one Coral button", () => {
    expect(html).toContain(">Something went wrong on our side</h1>");
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).not.toContain("The layout broke");
  });
});
