import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobChecker, ProfileFirst } from "./job-checker";

// The jobs page's two "not yet" states (#334): someone with no profile sees the three steps with the profile as the
// one to do now, and a signed-out visitor gets the profile page's sign-in card, with a Coral button. Its own file, so
// it doesn't meet the changes to jobs-ui.test.tsx in #342.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../job-actions", () => ({ checkJobAction: vi.fn() }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Jobs before the form", () => {
  it("shows the three steps with the profile first, and leads to it", () => {
    const html = renderToStaticMarkup(<ProfileFirst />);

    expect(html).toContain('aria-label="Your three steps"');
    expect(text(html)).toContain("1 Build your profile 2 Paste a job ad 3 Get a tailored CV and cover letter");
    expect(html).toMatch(/<li aria-current="step"[^>]*>.*?Build your profile<\/li>/);
    expect(html).toMatch(/<a href="\/profile" class="[^"]*bg-cta[^"]*">Build your profile<\/a>/);
  });

  it("asks a signed-out visitor to create an account or sign in, coming back to Jobs, with one Back", () => {
    const html = renderToStaticMarkup(<JobChecker demoMode={false} source={{ kind: "signed-out" }} />);

    expect(text(html)).toContain("Sign in to check a job against your profile");
    expect(html).toMatch(/<a href="\/sign-up\?next=%2Fjobs" class="[^"]*bg-cta[^"]*">Create your account<\/a>/);
    expect(html).toContain('href="/sign-in?next=%2Fjobs"');
    expect(text(html)).toContain("Free account. Start with your CV or your details.");
    // The page's own Back stays the only one: the card's Back to the home page is for the profile page.
    expect(html.match(/>Back<\/a>/g)).toHaveLength(1);
    expect(html.match(/bg-cta/g)).toHaveLength(1);
  });
});
