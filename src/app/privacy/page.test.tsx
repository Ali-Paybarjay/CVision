import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import PrivacyPage from "./page";

// Render checks for /privacy: the anchors other pages link to, the services and storage it must name,
// and a guard that fails when the app starts using a browser storage key this page does not list.

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const html = renderToStaticMarkup(<PrivacyPage />);
const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** Every source file outside the tests and this page. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path.endsWith(join("app", "privacy")) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// The interview lab is a developer page that isLabEnabled() turns off in production, so real users never get its key.
const labOnlyKeys = ["cvision.interview-lab.v1"];

describe("privacy page", () => {
  it("keeps the section the deletion message links to", () => {
    expect(html).toContain('id="not-deleted-straight-away"');
    expect(text).toContain("What isn’t deleted straight away");
  });

  it("links every contents entry to a section on the page", () => {
    const anchors = [...html.matchAll(/href="#([a-z-]+)"/g)].map((match) => match[1]);
    expect(anchors.length).toBeGreaterThan(5);
    for (const id of anchors) expect(html, id).toContain(`id="${id}"`);
  });

  it("names every service that sees the data, and where the processing happens", () => {
    for (const name of ["Supabase", "Vercel", "OpenRouter", "Anthropic", "Google Cloud", "Amazon Web Services"]) {
      expect(text).toContain(name);
    }
    expect(text).toContain("London");
    expect(text).toContain("in the EU or the US");
  });

  it("lists every cookie and every browser storage key the app uses", () => {
    expect(text).toContain("sb-…-auth-token");
    expect(text).toContain("code-verifier");

    const keys = new Set(
      sourceFiles(join(process.cwd(), "src")).flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(/["'`](cvision\.[a-z0-9.-]*[a-z0-9])/g)].map((match) => match[1]),
      ),
    );
    expect(keys).toContain("cvision.profile");
    for (const key of keys) {
      if (labOnlyKeys.includes(key)) continue;
      expect(text, `List the browser storage key ${key} on /privacy (src/app/privacy/page.tsx)`).toContain(key);
    }
  });

  it("says how to use the rights in the app and how to complain to the ICO", () => {
    expect(html).toContain('href="/dashboard"');
    expect(text).toContain("Download my data");
    expect(text).toContain("Delete my account");
    expect(html).toContain('href="https://ico.org.uk/make-a-complaint/');
  });

  it("never uses a banned phrase", () => {
    for (const phrase of brand.bannedPhrases) expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});
