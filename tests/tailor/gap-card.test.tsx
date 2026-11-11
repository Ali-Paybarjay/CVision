import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeCard } from "@/app/tailor/change-card";
import { GapCard, waitNote, waitsForModel, type GapPrompt } from "@/app/tailor/gap-card";
import { findBrandProblems } from "@/features/tailor/brand-check";
import type { TailoringChange } from "@/shared/contracts";
import { GapHelp } from "@/app/tailor/gap-help";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ answerGap: vi.fn() }));

const gap = personas.sara.match.gaps[0];
const card = (prompt: GapPrompt) =>
  renderToStaticMarkup(
    <GapCard jobId="j" prompt={prompt} state={{ phase: "open" }} setState={() => {}} onAnswered={() => {}} earlierAnswers={[]} changes={[]} onDecide={async () => {}} />,
  );

describe("the gap card", () => {
  it("shows the options to choose, with a plain no", () => {
    const html = card({ gap, question: "Have you used Power BI?", options: ["I built Power BI dashboards at work."] });
    expect(html).toContain("I built Power BI dashboards at work.");
    expect(html).toContain("No, I have not done this");
    expect(html).toContain("Save answer");
  });

  it("has an empty live region under Save answer, for the note while a suggestion is written (#325)", () => {
    const html = card({ gap, question: "Have you done this?" });
    expect(html.indexOf('<div aria-live="polite"></div>')).toBeGreaterThan(html.indexOf("Save answer"));
  });

  it("asks for the answer in the user's own words when the question has no options", () => {
    const html = card({ gap, question: "Have you done this?" });
    expect(html).toContain("Your answer…");
    expect(html).not.toContain("Or choose the one that fits");
  });
});

const suggestion = (status: TailoringChange["status"]): TailoringChange => ({
  id: "c",
  jobId: "j",
  section: "skills",
  before: null,
  after: "Power BI",
  evidence: "I built Power BI dashboards at work.",
  evidenceSource: "follow-up-answer",
  status,
});
const answered = (changes: TailoringChange[]) =>
  renderToStaticMarkup(
    <GapCard
      jobId="j"
      prompt={{ gap, question: "Have you used Power BI?" }}
      state={{ phase: "answered", nextSteps: [], hint: null }}
      setState={() => {}}
      onAnswered={() => {}}
      earlierAnswers={[]}
      changes={changes}
      onDecide={async () => {}}
    />,
  );

describe("an answered gap", () => {
  it("leaves the suggested line to its own Edit and Reject, with no second way back to the question", () => {
    const html = answered([suggestion("proposed")]);
    expect(html).toContain(">Edit<");
    expect(html).not.toContain("Change my answer");
  });

  it("lets the user change an answer that gave no line", () => {
    expect(answered([])).toContain("Change my answer");
  });
});

describe("the suggested change card", () => {
  const card = (status: TailoringChange["status"]) => renderToStaticMarkup(<ChangeCard change={suggestion(status)} onDecide={async () => {}} />);
  const button = (html: string, name: string) => html.match(new RegExp(`<button[^>]*>${name}</button>`))?.[0] ?? "";

  it("turns Approve off once the line is approved, and keeps Reject to change the decision", () => {
    const html = card("approved");
    expect(button(html, "Approve")).toContain('disabled=""');
    expect(button(html, "Approve")).toContain('aria-pressed="true"');
    expect(button(html, "Reject")).not.toContain('disabled=""');
    expect(html).toContain("✓ Approved");
  });

  it("has no Undo: Approve and Reject switch the decision", () => {
    expect(card("approved")).not.toContain("Undo");
    expect(card("rejected")).not.toContain("Undo");
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

describe("the note while an answer waits for the model (#468)", () => {
  it("shows for a yes, a typed no and the No button on a gap", () => {
    expect(waitsForModel("sara-gap-3", "I used Git at work.")).toBe(true);
    expect(waitsForModel("sara-gap-3", "No, not yet.")).toBe(true);
    expect(waitsForModel("sara-gap-3", null)).toBe(true);
  });

  it("does not show for the No button on a Make it stronger question, which needs no model", () => {
    expect(waitsForModel("stronger-ab12cd34", null)).toBe(false);
    expect(waitsForModel("stronger-ab12cd34", "I ran it for 120 stores.")).toBe(true);
  });

  it("is true for a yes and a no alike, in our voice", () => {
    expect(waitNote).toBe("Writing a suggestion from your answer. This can take up to 30 seconds.");
    expect(findBrandProblems(waitNote)).toEqual([]);
  });
});
