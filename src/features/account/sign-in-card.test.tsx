import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignInCard } from "./sign-in-card";

// The one card a signed-out visitor gets on every page that needs an account (#367). A pilot met a different message
// on each page, some with only "Sign in" and Tailor with neither.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const here = "/tailor?job=sara-job-1";

describe("SignInCard", () => {
  it("offers both choices, and each comes back to the page with its job", () => {
    const html = renderToStaticMarkup(<SignInCard title="Sign in to tailor your CV" text="Why it needs an account." next={here} />);

    expect(html).toContain('href="/sign-up?next=%2Ftailor%3Fjob%3Dsara-job-1"');
    expect(html).toContain('href="/sign-in?next=%2Ftailor%3Fjob%3Dsara-job-1"');
    expect(html).toContain(">I already have an account<");
    expect(html).toContain("Why it needs an account.");
  });

  it("puts the Coral button first, says what it does, and keeps \"free\" in the small line under it", () => {
    const html = renderToStaticMarkup(<SignInCard title="Sign in" text="Text" next="/profile" />);

    expect(html).toMatch(/bg-cta[^"]*"[^>]*>Create your account<\/a>/);
    expect(html.indexOf("Create your account")).toBeLessThan(html.indexOf("I already have an account"));
    expect(html).toContain("Free account. Start with your CV or your details.");
  });

  it("is an h2 under the page's own heading, or the page's h1 when asked", () => {
    expect(renderToStaticMarkup(<SignInCard title="Sign in" text="Text" next="/profile" />)).toMatch(/<h2[^>]*>Sign in<\/h2>/);
    expect(renderToStaticMarkup(<SignInCard title="Sign in" text="Text" next="/profile" as="h1" />)).toMatch(/<h1[^>]*>Sign in<\/h1>/);
  });
});
