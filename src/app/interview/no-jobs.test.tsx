import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NoJobsYet } from "./no-jobs";

// A signed-in user with no job yet saw only a note, with no way on (#502). Not reached in e2e: without Supabase the
// page always has Sara's sample jobs (src/features/profile/my-data.ts), so the empty state is checked here.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("NoJobsYet", () => {
  it("keeps the note and adds one Coral button, Paste a job ad, to Check a job", () => {
    const html = renderToStaticMarkup(<NoJobsYet />);

    expect(html).toContain("No jobs yet");
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/jobs" class="[^"]*bg-cta[^"]*">Paste a job ad<\/a>/);
    // Its own width, not the whole column's.
    expect(html).toMatch(/<a href="\/jobs" class="[^"]*self-start[^"]*">/);
  });
});
