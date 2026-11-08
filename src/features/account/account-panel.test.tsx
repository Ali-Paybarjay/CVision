import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The dashboard's card for a signed-out visitor: the app's one sign-in card (#367), coming back to the dashboard.

const { getCurrentUser, isSupabaseConfigured } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("./current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/env", () => ({ isSupabaseConfigured }));
vi.mock("./sign-out-button", () => ({ SignOutButton: () => <button type="submit">Sign out</button> }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const { AccountPanel } = await import("./account-panel");

describe("AccountPanel", () => {
  beforeEach(() => {
    isSupabaseConfigured.mockReturnValue(true);
  });

  it("shows a signed-out visitor the sign-in card, both choices coming back to the dashboard", async () => {
    getCurrentUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await AccountPanel());

    expect(html).toMatch(/<h2[^>]*>Sign in to see your applications<\/h2>/);
    // The dashboard is where signing in leads anyway, so the links need no ?next=.
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain(">I already have an account<");
  });

  it("shows a signed-in user their email and the way to their data", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "sam@example.com" });
    const html = renderToStaticMarkup(await AccountPanel());

    expect(html).toContain("sam@example.com");
    expect(html).not.toContain("Sign in to see your applications");
  });
});
