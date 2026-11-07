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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("PathSteps", () => {
  it("names all three steps in order, as one list in a labelled nav", () => {
    const html = renderToStaticMarkup(<PathSteps current={1} />);
    expect(html).toContain('<nav aria-label="Your progress">');
    expect(text(html)).toMatch(/1 Your profile.*2 Job ad.*3 Tailored CV/);
  });

  it("marks the current step in words for screen readers and says which comes next", () => {
    const html = renderToStaticMarkup(<PathSteps current={2} />);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Job ad/);
    expect(text(html)).toContain("Tailored CV (next)");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
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
