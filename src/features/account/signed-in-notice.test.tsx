import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignedInNotice } from "./signed-in-notice";

// The notice /sign-in and /sign-up show a signed-in user instead of the form (#328).

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./actions", () => ({ signOut: async () => {} }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|’/g, "'").replace(/\s+/g, " ");

describe("SignedInNotice", () => {
  it("says which account is signed in, and offers a way on and a way out", () => {
    const html = renderToStaticMarkup(<SignedInNotice mode="sign-up" email="sara@example.com" next="/interview?job=1" />);
    expect(text(html)).toContain("You're signed in as sara@example.com . To create another account, sign out first.");
    expect(html).toMatch(/<a href="\/interview\?job=1"[^>]*>Continue<\/a>/);
    expect(text(html)).toContain("Sign out");
  });

  it("talks about another account, not a new one, on the sign-in page", () => {
    const html = renderToStaticMarkup(<SignedInNotice mode="sign-in" email="sara@example.com" next="/dashboard" />);
    expect(text(html)).toContain("To use another account, sign out first.");
  });
});
