import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepTracker, TailorStep, type StepStatus } from "@/app/tailor/tailor-step";

const steps: { label: string; status: StepStatus }[] = [
  { label: "Job", status: "completed" },
  { label: "Questions", status: "in-progress" },
  { label: "Review", status: "not-started" },
];

/** Each button in the markup, as its own string. */
const buttons = (html: string) => html.match(/<button[\s\S]*?<\/button>/g) ?? [];

describe("the Tailor steps show they can be clicked", () => {
  it("marks only the open step as the current one", () => {
    const html = renderToStaticMarkup(<StepTracker steps={steps} current={2} onSelect={() => {}} />);
    const [job, questions, review] = buttons(html);
    expect(questions).toContain('aria-current="step"');
    expect(job).not.toContain("aria-current");
    expect(review).not.toContain("aria-current");
  });

  it("gives every circle and its name a hover state, since every step can be opened", () => {
    const html = renderToStaticMarkup(<StepTracker steps={steps} current={2} onSelect={() => {}} />);
    for (const button of buttons(html)) {
      expect(button).toMatch(/class="group /);
      expect(button).toContain("group-hover:underline");
    }
    // A circle that is not filled in yet takes the accent colour under the pointer.
    expect(buttons(html)[2]).toContain("group-hover:border-accent");
  });

  it("underlines a step's title on hover, open or closed", () => {
    for (const open of [true, false]) {
      const html = renderToStaticMarkup(
        <TailorStep id="step-1" title="1. Job" summary="The job ad" status="not-started" icon={null} open={open} onToggle={() => {}}>
          <p>Body</p>
        </TailorStep>,
      );
      expect(html).toContain('aria-expanded="' + open + '"');
      expect(html).toMatch(/group-hover:underline[^"]*">1\. Job</);
    }
  });

  it("uses role tokens only, never palette colours or dark: variants", () => {
    const html = renderToStaticMarkup(<StepTracker steps={steps} current={1} onSelect={() => {}} />);
    expect(html).not.toMatch(/\bdark:/);
    expect(html).not.toMatch(/-(?:blue|gray|slate|teal|red|green)-\d{2,3}\b/);
  });
});
