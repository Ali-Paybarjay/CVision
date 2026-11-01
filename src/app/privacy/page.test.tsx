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

const feedback = vi.hoisted(() => ({ feedbackFormUrl: null as string | null }));
vi.mock("@/shared/feedback", () => feedback);

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

  // Since #94 the approved profile and its CV file are saved to the account (src/features/profile/server/profile-account.ts).
  it("says the approved profile and CV file are kept in the account, not that the file is discarded", () => {
    expect(text).toContain("we save it to your account, with the CV file you uploaded (PDF or Word) if there is one");
    expect(text).not.toContain("We don’t keep your CV file");
    expect(text).not.toContain("saved in this browser only");
  });

  // Card #179: a profile typed in by hand sends nothing to the AI while typing, keeps no CV file, and needs its own consent.
  it("says what happens to a profile typed in without a CV", () => {
    expect(text).toContain("Nothing is sent to the AI while you type, and nothing is saved until you approve your profile.");
    expect(text).toContain("Then we save your profile, with no CV file.");
    expect(text).toContain("which you give when you approve your profile");
    // Such a profile has no CV file, so the page never says every profile comes with one.
    expect(text).not.toContain("your profile and CV file");
  });

  // The free CV check (#98, src/app/cv-check/api/route.ts) keeps no CV and no review, only cvcheck.completed and
  // askModel's ai_usage rows, both against getAnonymousKey()'s daily code even for a signed-in visitor.
  it("says what the free CV check sends to the AI and what it keeps", () => {
    expect(text).toContain("If you use the free CV check, our server sends your CV text to the AI to review it.");
    expect(text).toContain(
      "We don’t save your CV or the review, only a usage record with the score and how many issues were found",
    );
    expect(text).toContain("against the daily code, not your account, even if you’re signed in");
  });

  it("lists every cookie and every browser storage key the app uses", () => {
    expect(text).toContain("sb-…-auth-token");
    expect(text).toContain("code-verifier");
    expect(text).toContain("cvision-account-deleted");

    // This scans every owner's folders, so it also runs in teammates' PRs. Only Ali edits src/app/privacy (rule 2).
    const keys = new Set(
      sourceFiles(join(process.cwd(), "src")).flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(/["'`](cvision\.[A-Za-z0-9._:-]*[A-Za-z0-9])/g)].map(
          (match) => match[1],
        ),
      ),
    );
    expect(keys).toContain("cvision.profile");
    for (const key of keys) {
      if (labOnlyKeys.includes(key)) continue;
      expect(
        text,
        `New browser storage key ${key}: ask Ali to list it on /privacy (his PR must merge first; do not edit src/app/privacy)`,
      ).toContain(key);
    }
  });

  it("says how to use the rights in the app and how to complain to the ICO", () => {
    expect(html).toContain('href="/dashboard/your-data"');
    expect(text).toContain("Download my data");
    expect(text).toContain("Delete my account");
    expect(text).toContain("To withdraw your consent.");
    expect(html).toContain('href="https://ico.org.uk/make-a-complaint/');
  });

  it("never uses a banned phrase", () => {
    for (const phrase of brand.bannedPhrases) expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
  });

  it("has no Feedback section until the form's link is set", () => {
    expect(html).not.toContain('id="feedback"');
    expect(html).not.toContain('href="#feedback"');
  });

  it("says where Give feedback answers go, once the form's link is set (#134)", async () => {
    feedback.feedbackFormUrl = "https://forms.gle/example";
    vi.resetModules();
    const { default: Page } = await import("./page");
    const withForm = renderToStaticMarkup(<Page />);
    const words = withForm.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(withForm).toContain('href="#feedback"');
    expect(withForm).toContain('id="feedback"');
    expect(words).toContain("isn’t linked to your CVision account");
    expect(words).toContain("We delete them by 30 November 2026");
    expect(words).toContain("Google runs the form");
    feedback.feedbackFormUrl = null;
  });
});
