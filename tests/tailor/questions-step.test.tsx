import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GapPrompt, GapState } from "@/app/tailor/gap-card";
import { QuestionsStep } from "@/app/tailor/questions-step";
import { personas } from "@/shared/sample-data";

const prompts: GapPrompt[] = personas.sara.match.gaps.map((gap) => ({ gap, question: `About ${gap.requirement}?` }));
const answered: GapState = { phase: "answered", nextSteps: [], hint: null };

const step = (gapStates: Record<string, GapState>, questions = prompts, more: GapPrompt[] = []) =>
  renderToStaticMarkup(
    <QuestionsStep questions={questions} more={more} gapStates={gapStates} gapCard={(prompt) => <p>{prompt.question}</p>} onFinished={() => {}} />,
  );

describe("the questions step (#488)", () => {
  it("counts an answer under “More ways to strengthen your CV” too", () => {
    const [extra, ...main] = prompts;
    expect(step({ [extra.gap.id]: answered }, main, [extra])).toContain("Review your tailored CV now");
  });

  it("drops the note about unanswered questions when none are left", () => {
    const all = Object.fromEntries(prompts.map((prompt) => [prompt.gap.id, answered]));
    const html = step(all);
    expect(html).toContain("Review your tailored CV now");
    expect(html).not.toContain("The questions you haven’t answered");
  });

  it("has no way to the CV before the first answer, so nobody skips every question by mistake", () => {
    expect(step({})).not.toContain("Review your tailored CV now");
  });

  it("lets the user review their CV after one answer, and says the other questions wait (Tailor v2 review)", () => {
    const html = step({ [prompts[2].gap.id]: answered });
    expect(html).toContain("Review your tailored CV now");
    expect(html).toContain("The questions you haven’t answered stay here");
  });

  it("shows only the usual button on the last question", () => {
    const allButLast = Object.fromEntries(prompts.slice(0, -1).map((prompt) => [prompt.gap.id, answered]));
    const html = step(allButLast);
    expect(html).not.toContain("Review your tailored CV now");
    expect(html).toContain("Review your tailored CV");
  });
});
