// Step 3's preview puts the lines the user approved on Fit, so "Highlighted lines are the changes you approved" is true,
// and says the highlight is not in the download (#501). Without `marked` (the overview, the saved page) every line
// stays plain, as in the file. On a line of the last section, only the approved item is on Fit (#543).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CvPreview } from "@/app/tailor/cv-preview";
import { TailorWorkspace } from "@/app/tailor/tailor-workspace";
import { buildTailoredCv, otherLines } from "@/features/tailor/tailored-cv";
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
const holder = (html: string, text: string) => html.slice(0, html.indexOf(text)).match(/<(p|li)( [^>]*)?>$/)?.[0] ?? "";

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
    // Only the approved line: the lines the user did not change stay plain. The key under the CV is not counted.
    const paper = preview.slice(preview.indexOf('aria-label="Your tailored CV"'), preview.indexOf("</article>"));
    expect(paper.split("bg-fit").length - 1).toBe(1);
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

describe("an approved item on a line of the last section (#543)", () => {
  const withLastSection = { ...profile, skills: ["Excel", "SQL", "Tableau"], certifications: [{ name: "PRINCE2 Foundation", year: 2023 }], languages: [{ name: "Welsh", level: "Fluent" }] };
  const added = (section: TailoringChange["section"], text: string): TailoringChange => ({ ...approved, id: `new-${text}`, section, before: null, after: text });

  it.each([
    ["a tool", "Skills and tools:", added("skills", "Power BI"), ["Excel", "SQL", "Tableau"]],
    ["a certificate", "Certificates:", added("certifications", "Google Data Analytics Certificate"), ["PRINCE2 Foundation (2023)"]],
    ["a language", "Languages:", added("skills", "Spanish (Conversational)"), ["Welsh (Fluent)"]],
  ] as const)("puts only %s the user approved on Fit, not the whole line", (_, label, change, others) => {
    const html = renderToStaticMarkup(<CvPreview cv={buildTailoredCv(withLastSection, [change], job)} marked />);
    // Only the approved item is marked, with the screen reader note right after it.
    expect(html).toMatch(new RegExp(`<mark class="[^"]*bg-fit[^"]*">${change.after.replace(/[()]/g, "\\$&")}</mark><span class="sr-only"> \\(tailored for this job\\)</span>`));
    expect(html.split("bg-fit").length - 1).toBe(1);
    // The line itself is plain, and so are the items the user did not change.
    const line = html.slice(html.indexOf(`<p><strong>${label} </strong>`));
    expect(line).not.toBe(html);
    for (const item of others) expect(line.slice(0, line.indexOf("</p>"))).toContain(item);
    expect(html).not.toMatch(/<mark[^>]*>(Excel|SQL|Tableau|PRINCE2|Welsh)/);
  });

  it("marks nothing without marked, and the line reads as the file prints it", () => {
    const cv = buildTailoredCv(withLastSection, [added("skills", "Power BI")], job);
    const html = renderToStaticMarkup(<CvPreview cv={cv} />);
    expect(html).not.toContain("<mark");
    expect(html).not.toContain("bg-fit");
    expect(html).toContain("(tailored for this job)");
    const tools = html.slice(html.indexOf("<p><strong>Skills and tools: </strong>"));
    const file = otherLines(cv).find((line) => line.label === "Skills and tools:");
    expect(file?.text).toMatch(/^Power BI, /);
    expect(tools.slice(0, tools.indexOf("</p>")).replace(/<[^>]+>|\(tailored for this job\)/g, "").replace(/\s+,/g, ",").trim()).toBe(`Skills and tools: ${file?.text}`);
  });
});

describe("the live CV beside the questions (#559)", () => {
  const live = (changes: TailoringChange[]) => {
    const html = renderToStaticMarkup(<TailorWorkspace job={job} jobUrl={null} label="" profile={profile} prompts={[]} savedChanges={changes} />);
    const start = html.indexOf('aria-label="Your tailored CV"');
    return html.slice(start, html.indexOf("</article>", start));
  };

  it("shows a suggestion from an answer in a dashed box, before it is approved", () => {
    const paper = live([{ ...approved, status: "proposed" }]);
    expect(paper).toContain(after);
    expect(holder(paper, after)).toBe("");
    expect(paper).toContain("border-dashed");
    expect(paper).toContain("(suggested, not on your CV yet)");
  });

  it("leaves a suggestion from the CV itself off until it is approved, so the answers' lines stand out", () => {
    const paper = live([{ ...approved, gapId: undefined, evidenceSource: "cv", status: "proposed" }]);
    expect(paper).not.toContain(after);
    expect(paper).not.toContain("border-dashed");
  });
});
