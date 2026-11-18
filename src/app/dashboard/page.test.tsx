import { prerender } from "react-dom/static";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import DashboardPage from "./page";

// The dashboard's "Two different checks" card (#542) was shown to signed-out visitors too, above the sign-in card
// (#548). The tracker and the account panel have their own tests; here they only mark where they sit.

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/tracker/tracker", () => ({
  Tracker: () => <section id="tracker">Jobs in progress</section>,
  TrackerFallback: () => null,
}));
vi.mock("@/features/account/account-panel", () => ({
  AccountPanel: () => <section id="account-panel">Sign in to see your applications</section>,
  AccountPanelFallback: () => null,
}));

// Nobody is signed in unless a test says so.
const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
getCurrentUser.mockResolvedValue(null);

/** The whole page, with what reads the session streamed in. */
async function render() {
  const { prelude } = await prerender(<DashboardPage />);
  return new Response(prelude).text();
}

afterEach(() => {
  getCurrentUser.mockResolvedValue(null);
});

describe("Dashboard's two checks (#548)", () => {
  it("are not shown to a signed-out visitor, who keeps the CV check in the menu", async () => {
    const html = await render();

    expect(html).toContain('id="account-panel"');
    expect(html).not.toContain("Two different checks");
    expect(html).not.toContain('href="/cv-check"');
  });

  it("are shown to a signed-in user after the tracker and its jobs in progress, before the account panel", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "sam@example.com" });
    const html = await render();

    expect(html).toContain("Two different checks");
    expect(html.indexOf('id="tracker"')).toBeLessThan(html.indexOf("Two different checks"));
    expect(html.indexOf("Two different checks")).toBeLessThan(html.indexOf('id="account-panel"'));
  });

  it("name the CV check by the brand's question and button, as plain links beside Check a job", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "sam@example.com" });
    const html = await render();

    expect(html).toContain(`>${brand.cta.cvCheckQuestion}</h3>`);
    expect(html).toMatch(new RegExp(`<a href="/cv-check" class="[^"]*">${brand.cta.cvCheckAction}</a>`));
    expect(html).toMatch(/<a href="\/jobs" class="[^"]*">Check a job<\/a>/);
    // The tracker's own Coral button stays the page's only one.
    expect(html).not.toContain("bg-cta");
  });
});
