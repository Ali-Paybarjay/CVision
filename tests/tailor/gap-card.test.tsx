import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GapCard, type GapPrompt } from "@/app/tailor/gap-card";
import { GapHelp } from "@/app/tailor/gap-help";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ answerGap: vi.fn() }));

const gap = personas.sara.match.gaps[0];
const card = (prompt: GapPrompt) =>
  renderToStaticMarkup(
    <GapCard jobId="j" prompt={prompt} state={{ phase: "open" }} setState={() => {}} onAnswered={() => {}} earlierAnswers={[]} changes={[]} onDecide={async () => {}} />,
  );

describe("the gap card", () => {
  it("shows the options to tap, with a plain no", () => {
    const html = card({ gap, question: "Have you used Power BI?", options: ["I built Power BI dashboards at work."] });
    expect(html).toContain("I built Power BI dashboards at work.");
    expect(html).toContain("No, I have not done this");
    expect(html).not.toContain("Yes, at work");
  });

  it("falls back to yes or no when the question has no options", () => {
    expect(card({ gap, question: "Have you done this?" })).toContain("Yes, at work");
  });
});

describe("the gap help", () => {
  it("has a labelled question mark that starts closed", () => {
    const html = renderToStaticMarkup(<GapHelp />);
    expect(html).toContain('aria-label="Why we ask these questions"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("What is a gap?");
  });
});
