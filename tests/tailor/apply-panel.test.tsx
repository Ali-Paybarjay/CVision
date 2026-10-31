import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplyPanel, linkSite } from "@/app/tailor/apply-panel";

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
