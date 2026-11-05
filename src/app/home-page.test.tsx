import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

describe("home page headline (#178)", () => {
  // Rendered once the earlier tests have run, so the click records they count stay as they were.
  let html = "";
  let hero = "";
  beforeAll(() => {
    html = renderToStaticMarkup(<HomePage />);
    hero = html.slice(0, html.indexOf("</section>"));
  });
  const words = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

  it("leads with the team's chosen headline and subline, and keeps the tagline out of the hero", () => {
    expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe("Stop rewriting your CV for every job.");
    expect(words(html)).toContain(brand.hero.subline);
    expect(html).not.toContain(brand.tagline);
  });

  it("says each sentence of the hero once, above the fold", () => {
    const sentences = [brand.hero.headline, ...brand.hero.subline.split(/(?<=\.)\s+/), brand.cta.primaryNote];
    for (const sentence of sentences) expect(words(hero).split(sentence).length - 1, sentence).toBe(1);
    // "Paste a job ad" opens the subline, so the line under the button doesn't say it again (Marzieh, #268).
    expect(words(hero).toLowerCase().split("paste a job ad").length - 1).toBe(1);
  });

  it("shows Sara's tailored CV with its title, the fictional-example caption and Nothing invented (Marzieh, #176)", () => {
    expect(html).toContain("<h2 id=\"example-title\"");
    expect(words(html)).toContain("Sara’s CV, tailored for a Junior Data Analyst job");
    expect(words(html)).toContain("Sara Khan is a fictional example.");
    expect(words(hero).split(brand.proof).length - 1).toBe(1);
  });

  it("explains every requirement in a table, with the line Sara's answer changed", () => {
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(table.match(/<th scope="row"/g)).toHaveLength(7);
    expect(words(table)).toContain("Your CV said: “Built Tableau dashboards for the regional sales team”");
    expect(words(table)).toContain("Not on your CV, so we won’t add it.");
    // A summary of the CV is not put in quote marks; only a line of it word for word is (Nazanin, #295).
    expect(words(table)).toContain("From your CV, in short: Skills: Python (pandas), R; MSc Data Science");
    expect(words(table)).not.toContain("“Skills:");
  });

  it("uses no words the brand bans", () => {
    for (const phrase of brand.bannedPhrases) {
      expect(`${brand.hero.headline} ${brand.hero.subline}`.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});
