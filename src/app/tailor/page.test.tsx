import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { wideFrame } from "@/shared/ui";
import TailorPage from "./page";

// The note while a job's workspace loads sat in the narrow page frame, so the path steps jumped left and up when the
// wide workspace arrived (#393). It now shares the workspace's wide frame.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function loadingMarkup(): string {
  const page = TailorPage({ searchParams: Promise.resolve({ job: "job-1" }) } as unknown as PageProps<"/tailor">) as ReactElement<{
    fallback: React.ReactNode;
  }>;
  expect(isValidElement(page.props.fallback)).toBe(true);
  return renderToStaticMarkup(page.props.fallback);
}

describe("Tailor while it loads", () => {
  it("says what is happening and how long it can take", () => {
    expect(loadingMarkup()).toContain("can take up to a minute");
  });

  it("has the sentence inside the live region in the server's HTML (#419)", () => {
    expect(loadingMarkup()).toMatch(/<div aria-live="polite"><p[^>]*>.*can take up to a minute/);
  });

  it("sits in the same wide frame as the workspace, with the path steps first and no page title", () => {
    const html = loadingMarkup();
    for (const name of wideFrame.split(" ")) expect(html).toContain(name);
    expect(html).not.toContain("max-w-3xl");
    expect(html).not.toContain("<h1");
    expect(html.indexOf('aria-label="Your progress"')).toBeLessThan(html.indexOf("can take up to a minute"));
  });
});
