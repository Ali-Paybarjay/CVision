import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplyPanel, interviewPracticePath, linkSite } from "@/app/tailor/apply-panel";

vi.mock("@/features/tailor/actions", () => ({ recordApply: vi.fn() }));

const panel = (jobUrl: string | null) => renderToStaticMarkup(<ApplyPanel jobId="j" jobUrl={jobUrl} onApplied={() => {}} />);

describe("the Apply button names the site it really opens (#240)", () => {
  it("names a job board, not the employer", () => {
    const html = panel("https://www.linkedin.com/jobs/view/123");
    expect(html).toContain("Open the ad on linkedin.com");
    expect(html).toContain("This opens the job ad on linkedin.com");
    expect(html).not.toContain("site</");
  });

  it("names the employer's own site by its address too, without guessing whose it is", () => {
    expect(panel("https://careers.pennine-health.example/jobs/1")).toContain("Open the ad on careers.pennine-health.example");
  });

  it("falls back to a plain name for a link it cannot read", () => {
    expect(linkSite("not a link")).toBeNull();
    expect(panel("not a link")).toContain("Open the job ad");
  });

  it("still says the app never applies, and shows the no-link notice without a link", () => {
    expect(panel("https://www.reed.co.uk/jobs/1")).toContain("We never apply for you.");
    expect(panel(null)).toContain("This job ad has no link");
  });
});

describe("after Apply, step 5 leads to interview practice for the same job", () => {
  it("links to this job's practice, with the dashboard's name for it", () => {
    const html = panel("https://www.reed.co.uk/jobs/1");
    expect(html).toMatch(/<a [^>]*href="\/interview\?job=j"[^>]*>Start interview practice<\/a>/);
    expect(html).toContain("while you wait to hear back");
  });

  it("keeps Open the ad as the one Coral button", () => {
    const html = panel("https://www.reed.co.uk/jobs/1");
    const coral = html.match(/bg-cta/g) ?? [];
    expect(coral).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*bg-cta[^>]*>Open the ad on reed\.co\.uk/);
  });

  it("shows the link when the ad has no link too, and encodes the job id", () => {
    expect(panel(null)).toContain("Start interview practice");
    expect(interviewPracticePath("job 1/2")).toBe("/interview?job=job%201%2F2");
  });

  it("uses practice as a noun only", () => {
    expect(panel("https://www.reed.co.uk/jobs/1")).not.toMatch(/practis/i);
  });
});
