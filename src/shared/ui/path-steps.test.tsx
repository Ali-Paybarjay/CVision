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
  it("says which step of three in words, and names all three in order, in a labelled nav", () => {
    const html = renderToStaticMarkup(<PathSteps current={1} />);
    expect(html).toContain('aria-label="Your progress"');
    expect(text(html)).toMatch(/^Step 1 of 3 Profile .*Job ad .*Tailored CV/);
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
