import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobChecker, ProfileFirst } from "./job-checker";

// The jobs page's two "not yet" states (#334): someone with no profile is told the profile is step 1, the
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
  it("names the profile as step 1, the step before Jobs in the bar at the top of the page, and leads to it", () => {
    const html = renderToStaticMarkup(<ProfileFirst />);

    expect(text(html)).toContain("Your profile is step 1.");
    // One step indicator per page: the bar at the top (#347), not a second list in the card.
    expect(html).not.toContain('aria-current="step"');
    expect(html).toMatch(/<a href="\/profile" class="[^"]*bg-cta[^"]*">Build your profile<\/a>/);
  });

  it("asks a signed-out visitor to create an account or sign in, coming back to Jobs, with no Back", () => {
    const html = renderToStaticMarkup(<JobChecker demoMode={false} source={{ kind: "signed-out" }} />);

    expect(text(html)).toContain("Sign in to check a job against your profile");
    expect(html).toMatch(/<a href="\/sign-up\?next=%2Fjobs" class="[^"]*bg-cta[^"]*">Create your account<\/a>/);
    expect(html).toContain('href="/sign-in?next=%2Fjobs"');
    expect(text(html)).toContain("Free account. Start with your CV or your details.");
    // No Back out of the page: the steps bar and the menu at the top lead everywhere else.
    expect(html).not.toContain(">Back<");
    expect(html.match(/bg-cta/g)).toHaveLength(1);
  });
});
