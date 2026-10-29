import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import { Tracker } from "./tracker";

// The dashboard for a signed-in user with no applications yet: the three brand steps and one button to the
// profile page, where they upload a CV or fill in their details (card #179). The list itself is tested in
// application-list.test.tsx.

vi.mock("next/cache", () => ({ io: async () => {} }));
vi.mock("./applications", () => ({ loadTracker: async () => ({ kind: "account", items: [] }) }));
vi.mock("./actions", () => ({ updateApplication: async () => undefined, closeWithoutNews: async () => undefined }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("the dashboard's empty tracker", () => {
  it("shows the three brand steps and a button that leads to the profile page", async () => {
    const html = renderToStaticMarkup(await Tracker());

    expect(html).toContain("No applications yet");
    for (const step of brand.steps) expect(html).toContain(step.title);
    expect(html).toMatch(/<a href="\/profile"[^>]*>Build your profile<\/a>/);
  });
});
