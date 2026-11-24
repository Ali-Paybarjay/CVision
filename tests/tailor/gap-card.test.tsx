import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeCard } from "@/app/tailor/change-card";
import { GapCard, waitNote, waitsForModel, whyAsking, type GapPrompt } from "@/app/tailor/gap-card";
import { findBrandProblems } from "@/features/tailor/brand-check";
import type { Gap, TailoringChange } from "@/shared/contracts";
import { GapHelp } from "@/app/tailor/gap-help";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ answerGap: vi.fn() }));

const gap = personas.sara.match.gaps[0];
const card = (prompt: GapPrompt, main?: boolean) =>
  renderToStaticMarkup(
    <GapCard jobId="j" prompt={prompt} state={{ phase: "open" }} setState={() => {}} onAnswered={() => {}} earlierAnswers={[]} changes={[]} onDecide={async () => {}} main={main} />,
  );
const saveAnswer = (html: string) => html.match(/<button[^>]*>Save answer<\/button>/)?.[0] ?? "";

describe("Save answer (#500)", () => {
  it("is the step's Coral button on a question asked one at a time", () => {
    const button = saveAnswer(card({ gap, question: "Have you done this?" }, true));
    expect(button).toContain("bg-cta");
    expect(button).not.toContain("bg-emphasis");
  });

  it("stays plain on a question under “More ways to strengthen your CV”, where several are open at once", () => {
    const button = saveAnswer(card({ gap, question: "Have you done this?" }));
    expect(button).not.toBe("");
    expect(button).not.toContain("bg-cta");
  });
});

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

  // #308 had no Undo; a user on the live site could not see the way back after Approve, so #531 adds one beside the decision.
  it("keeps Approve and Reject to switch the decision, and adds Undo only once a decision is made (#531)", () => {
    expect(card("approved")).toContain(">Undo<");
    expect(card("rejected")).toContain(">Undo<");
    expect(card("proposed")).not.toContain("Undo");
  });
});

describe("a question with a suggestion under it (#531)", () => {
  it("labels the suggestion as coming from the answer, above the card that names the CV section", () => {
    const html = answered([{ ...suggestion("proposed"), section: "experience", before: "Built Tableau dashboards" }]);
    const label = html.indexOf(">Suggestion from your answer<");
    expect(label).toBeGreaterThan(html.indexOf("Have you used Power BI?"));
    expect(label).toBeLessThan(html.indexOf(">Work experience<"));
    // The kit's small capitals label, set apart from the question by a line.
    expect(html).toMatch(/<div class="[^"]*border-t border-line[^"]*"><p class="[^"]*uppercase[^"]*"[^>]*>Suggestion from your answer<\/p>/);
  });

  it("says suggestions when the answer gave more than one", () => {
    const html = answered([suggestion("proposed"), { ...suggestion("proposed"), id: "c2", after: "DAX" }]);
    expect(html).toContain(">Suggestions from your answer<");
  });

  it("has no label while there is no suggestion", () => {
    expect(answered([])).not.toContain("from your answer");
    expect(card({ gap, question: "Have you done this?" })).not.toContain("from your answer");
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

describe("Why we’re asking (#565)", () => {
  const line = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
  const stronger: Gap = { id: "stronger-ab12cd34", requirement: "Strong SQL", importance: "essential", kind: "unclear", detail: `Already shown by: "${line}"` };

  it("quotes the CV line a Make it stronger question builds on, and asks only for more", () => {
    const why = whyAsking(stronger);
    expect(why).toBe(`your CV shows this in “${line}”; a detail such as a number, the scale or a result would make it stronger for this job.`);
    expect(why).not.toMatch(/touches on|without a clear example|not clearly/);
    expect(findBrandProblems(why)).toEqual([]);
  });

  it("still says the CV shows it when the detail has no line to quote", () => {
    expect(whyAsking({ ...stronger, detail: "" })).toBe("your CV shows this; a detail such as a number, the scale or a result would make it stronger for this job.");
  });

  it("never says the CV touches on an unclear requirement it has no line for", () => {
    const unclear: Gap = { id: "gap-1", requirement: "Clear communication with non-technical stakeholders", importance: "essential", kind: "unclear", detail: "" };
    expect(whyAsking(unclear)).toBe("your CV doesn’t show this clearly yet.");
    expect(whyAsking({ ...unclear, evidence: ["Built Tableau dashboards for the regional sales team"] })).toBe(
      "your CV says “Built Tableau dashboards for the regional sales team”, but not clearly enough for this job.",
    );
    expect(whyAsking({ ...unclear, kind: "missing" })).toBe("the job asks for this, and your CV doesn’t show it yet.");
  });

  it("is what the card shows", () => {
    expect(card({ gap: stronger, question: "The job asks for “Strong SQL”, and your CV shows it. Can you add a detail?" })).toContain(`your CV shows this in “${line}”`);
  });
});
