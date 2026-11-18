// Step 3's preview puts the lines the user approved on Fit, so "Highlighted lines are the changes you approved" is true,
// and says the highlight is not in the download (#501). Without `marked` (the overview, the saved page) every line
// stays plain, as in the file.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CvPreview } from "@/app/tailor/cv-preview";
import { TailorWorkspace } from "@/app/tailor/tailor-workspace";
import { buildTailoredCv } from "@/features/tailor/tailored-cv";
import type { TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ decideChange: vi.fn(), answerGap: vi.fn(), suggestCvChanges: vi.fn(), createCoverLetter: vi.fn(), recordApply: vi.fn() }));

const { profile, jobs } = personas.sara;
const job = jobs[0];
const after = "Built Tableau dashboards for the regional sales team and walked the regional managers through them every Monday";
const approved: TailoringChange = {
  id: "change-1",
  jobId: job.id,
  gapId: "sara-gap-1",
  section: "experience",
  before: "Built Tableau dashboards for the regional sales team",
  after,
  evidence: "Every Monday I walked the regional managers through the dashboard",
  evidenceSource: "follow-up-answer",
  status: "approved",
};
const sentence = "Highlighted lines are the changes you approved. The highlight is only on this page, not in your download.";

/** The opening tag of the element that holds the text, with the text right after it. */
const holder = (html: string, text: string) => html.slice(0, html.indexOf(text)).match(/<(p|li)( class="[^"]*")?>$/)?.[0] ?? "";

describe("the preview in step 3 (#501)", () => {
  it("says what the highlight is, and puts the approved line on Fit", () => {
    const html = renderToStaticMarkup(
      <TailorWorkspace job={job} jobUrl={null} label="" profile={profile} prompts={[]} savedChanges={[approved]} />,
    );
    const start = html.indexOf('id="preview-heading"');
    expect(start).toBeGreaterThan(-1);
    const preview = html.slice(start, html.indexOf("</aside>", start));

    expect(preview).toContain(sentence);
    expect(preview).toContain(after);
    expect(holder(preview, after)).toContain("bg-fit");
    // Only the approved line: the lines the user did not change stay plain.
    expect(preview.split("bg-fit").length - 1).toBe(1);
    // A screen reader still hears which line was tailored.
    expect(preview).toContain("(tailored for this job)");
  });
});

describe("the preview anywhere else", () => {
  const cv = buildTailoredCv(profile, [approved], job);

  it("has no highlight without marked, as in the download", () => {
    const html = renderToStaticMarkup(<CvPreview cv={cv} />);
    expect(html).toContain(after);
    expect(html).not.toContain("bg-fit");
    expect(html).toContain("(tailored for this job)");
  });

  it("puts the approved line, and only it, on Fit with marked", () => {
    const html = renderToStaticMarkup(<CvPreview cv={cv} marked />);
    expect(holder(html, after)).toContain("bg-fit");
    expect(html.split("bg-fit").length - 1).toBe(1);
  });
});
