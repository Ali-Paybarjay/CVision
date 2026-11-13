// A job's page has a way back to the list of jobs, for a user who picked the wrong one (#462). It comes right after the
// heading, which takes focus when the page is ready, so a screen reader reaches it, and before the overview, so it is
// seen at once.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TailorWorkspace } from "@/app/tailor/tailor-workspace";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ decideChange: vi.fn(), answerGap: vi.fn(), suggestCvChanges: vi.fn(), createCoverLetter: vi.fn(), recordApply: vi.fn() }));

const { profile, jobs } = personas.sara;

describe("the way back to the list (#462)", () => {
  it("links to the list, after the heading and before the overview", () => {
    const html = renderToStaticMarkup(<TailorWorkspace job={jobs[0]} jobUrl={null} label="" profile={profile} prompts={[]} />);
    const link = html.indexOf('href="/tailor"');
    expect(html).toContain("← Choose another job");
    expect(html.indexOf("<h1")).toBeLessThan(link);
    expect(link).toBeLessThan(html.indexOf('aria-label="Your CV at a glance"'));
  });
});
