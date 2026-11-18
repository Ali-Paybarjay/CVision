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

describe("an ad with no link still reaches the dashboard, with an I’ve applied button (#498)", () => {
  it("offers I’ve applied as the one Coral button", () => {
    const html = panel(null);
    expect(html).toMatch(/<button [^>]*bg-cta[^>]*>I’ve applied: add it to my applications<\/button>/);
    expect(html.match(/bg-cta/g) ?? []).toHaveLength(1);
  });

  it("says how to apply without a link, in a note rather than a warning", () => {
    const html = panel(null);
    expect(html).toContain("This job ad has no link");
    expect(html).toContain("Apply the way the ad describes, for example by email.");
    expect(html).not.toContain("bg-warning-bg");
  });

  it("does not promise a new tab when there is no ad to open", () => {
    const html = panel(null);
    expect(html).toContain("We never apply for you.");
    expect(html).toContain("You send your CV and cover letter yourself.");
    expect(html).not.toContain("in a new tab");
  });

  it("keeps I’ve applied away from an ad with a link", () => {
    const html = panel("https://www.reed.co.uk/jobs/1");
    expect(html).not.toContain("I’ve applied");
    expect(html).toContain("in a new tab");
    expect(html).not.toContain("This job ad has no link");
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
