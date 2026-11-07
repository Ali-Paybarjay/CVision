import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PathSteps } from "./path-steps";

// Render checks for the main path's steps (#238): which step is current, which link back, and what comes next.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("PathSteps", () => {
  it("names all three steps in order, in a labelled nav, with no step number to echo the pages' own steps", () => {
    const html = renderToStaticMarkup(<PathSteps current={1} />);
    expect(html).toContain('aria-label="Your progress"');
    expect(text(html)).toMatch(/^Profile .*Job ad .*Tailored CV/);
    expect(text(html)).not.toMatch(/Step \d/);
  });

  // The pages' own steps (Profile's two, Tailor's five) use aria-current="step"; each step here is a page.
  it("marks the current step as the current page, once, and says which comes next", () => {
    const html = renderToStaticMarkup(<PathSteps current={2} />);
    expect(html).toMatch(/aria-current="page"[^>]*>Job ad/);
    expect(html.match(/aria-current=/g)).toHaveLength(1);
    expect(html).not.toContain('aria-current="step"');
    expect(text(html)).toContain("Tailored CV (next)");
  });

  it("has no numbered circles that could be taken for the pages' own steps", () => {
    expect(renderToStaticMarkup(<PathSteps current={1} />)).not.toContain("rounded-full");
  });

  // Colour alone doesn't tell a link from plain text (end-of-batch review).
  it("underlines the links back, and gives them a 44px target", () => {
    const html = renderToStaticMarkup(<PathSteps current={3} />);
    const profileLink = html.match(/<a href="\/profile" class="([^"]*)"/)?.[1] ?? "";
    expect(profileLink.split(" ")).toEqual(expect.arrayContaining(["underline", "min-w-11", "min-h-11"]));
    expect(profileLink).not.toContain("hover:underline");
  });

  it("links back only to the steps before the current one", () => {
    expect(renderToStaticMarkup(<PathSteps current={1} />)).not.toContain("<a ");
    const onJobs = renderToStaticMarkup(<PathSteps current={2} />);
    expect(onJobs).toContain('href="/profile"');
    expect(onJobs).not.toContain('href="/jobs"');
    const onTailor = renderToStaticMarkup(<PathSteps current={3} />);
    expect(onTailor).toContain('href="/profile"');
    expect(onTailor).toContain('href="/jobs"');
    expect(text(onTailor)).not.toContain("(next)");
  });
});
