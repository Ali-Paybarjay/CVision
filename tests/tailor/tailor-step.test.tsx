// A step's status was said on every row as well as in the circles above and beside the title (#500): now a screen
// reader alone hears it on the row.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionIcon, TailorStep, type StepStatus } from "@/app/tailor/tailor-step";

const row = (status: StepStatus, open = false) =>
  renderToStaticMarkup(
    <TailorStep id="step-2" title="2. Questions about your experience" summary="What the job asks for" status={status} icon={<QuestionIcon />} open={open} onToggle={() => {}}>
      <p>Inside the step</p>
    </TailorStep>,
  );

describe("a Tailor step's row (#500)", () => {
  it("says “Not started” to a screen reader only", () => {
    const html = row("not-started");
    expect(html).toContain('<span class="sr-only">, Not started</span>');
    expect(html.match(/Not started/g)).toHaveLength(1);
  });

  it("has no visible status label, open or closed", () => {
    for (const html of [row("in-progress", true), row("completed")]) {
      expect(html).not.toContain("rounded-full px-3 py-1");
    }
    expect(row("in-progress", true)).toContain('<span class="sr-only">, In progress</span>');
  });

  it("keeps the tick on a closed finished step", () => {
    expect(row("completed")).toContain('<circle cx="12" cy="12" r="10" class="fill-accent"></circle>');
    expect(row("completed")).toContain('<span class="sr-only">, Completed</span>');
  });
});
