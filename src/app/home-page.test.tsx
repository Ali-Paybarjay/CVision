import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import HomePage from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The page binds the Server Action to each button's fixed cta and placement values: record them.
const tracked = vi.hoisted(() => [] as unknown[]);
vi.mock("@/shared/analytics/actions", () => {
  const trackHomeCtaClick = async () => {};
  trackHomeCtaClick.bind = (_this: unknown, click: unknown) => {
    tracked.push(click);
    return async () => {};
  };
  return { trackHomeCtaClick };
});

/** The text of the element with this id, from the rendered page. */
function textOf(html: string, id: string) {
  return html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1];
}

describe("home page calls to action (#177)", () => {
  const html = renderToStaticMarkup(<HomePage />);

  it("names each action by what you get, with Free only in the small line under it", () => {
    expect(brand.cta.primary).toBe("Tailor my CV to a job");
    expect(brand.cta.cvCheckAction).toBe("Check my CV in 2 minutes");
    expect(brand.cta.primary).not.toMatch(/free/i);
    expect(brand.cta.cvCheckAction).not.toMatch(/free/i);

    const primary = html.match(/<a href="\/sign-up"([^>]*)>([^<]*)<\/a>/);
    expect(primary?.[2]).toBe(brand.cta.primary);
    expect(primary?.[1]).toContain('aria-describedby="hero-cta-note"');
    expect(textOf(html, "hero-cta-note")).toBe(brand.cta.primaryNote);

    const cvCheck = html.match(/<a href="\/cv-check"([^>]*)>([^<]*)<\/a>/);
    expect(cvCheck?.[2]).toBe(brand.cta.cvCheckAction);
    expect(cvCheck?.[1]).toContain('aria-describedby="cv-check-cta-note"');
    expect(textOf(html, "cv-check-cta-note")).toBe(brand.cta.cvCheckNote);
  });

  it("speaks to people with or without a CV under the primary button", () => {
    expect(brand.cta.primaryNote).toMatch(/^Free account\./);
    expect(brand.cta.primaryNote).toContain("your CV or your details");
    expect(brand.cta.cvCheckNote).toBe("No sign-up. Nothing is saved.");
  });

  it("has one Coral button", () => {
    expect(html.match(/bg-cta text-on-cta/g)).toHaveLength(1);
  });

  it("still records home.cta_clicked for both hero buttons with the same values", () => {
    expect(tracked).toEqual([
      { cta: "get_started", placement: "hero" },
      { cta: "cv_check", placement: "hero" },
    ]);
  });
});
