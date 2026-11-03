// The last practice (#206): the report is read first, and "New practice" sits below it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { runMockSession } from "@/features/interview/test-support";
import { answersGiven, ConfirmStartAgain, LastPractice } from "./practice";

const noop = () => {};

describe("the last practice", () => {
  it("shows the date, then the whole report, then the line and the New practice button", async () => {
    const session = await runMockSession(dataAnalystSara);
    const html = renderToStaticMarkup(
      <LastPractice report={{ session, practisedAt: "2026-10-29T10:00:00Z" }} unfinishedSince={null} onContinue={noop} onPractiseAgain={noop} />,
    );

    const line = html.indexOf("Read your feedback first. When you are ready, start a new practice.");
    expect(html.indexOf("Your last practice")).toBeLessThan(html.indexOf("Overall score"));
    // After the last answer card, so nothing in the report sits below the button.
    expect(html.lastIndexOf("Do this next time")).toBeLessThan(line);
    expect(html.match(/>New practice<\/button>/g)).toHaveLength(1);
    expect(html.indexOf(">New practice</button>")).toBeGreaterThan(line);
    expect(html).not.toContain("unfinished practice");
  });

  it("over an unfinished practice, offers to continue it above the report", async () => {
    const session = await runMockSession(dataAnalystSara);
    const html = renderToStaticMarkup(
      <LastPractice
        report={{ session, practisedAt: "2026-10-28T10:00:00Z" }}
        unfinishedSince="2026-10-30T09:00:00Z"
        onContinue={noop}
        onPractiseAgain={noop}
      />,
    );

    expect(html).toContain("You have an unfinished practice");
    expect(html).toContain('Started <time dateTime="2026-10-30T09:00:00Z">30 Oct 2026</time>. The report below is from your last finished');
    expect(html.match(/>Continue your practice<\/button>/g)).toHaveLength(1);
    expect(html.indexOf(">Continue your practice</button>")).toBeLessThan(html.indexOf("Your last practice"));
    expect(html.indexOf("Your last practice")).toBeLessThan(html.indexOf("Overall score"));
    // New practice still starts a new practice, below the report.
    expect(html.match(/>New practice<\/button>/g)).toHaveLength(1);
  });
});

describe("Start again during a practice (#263)", () => {
  it("counts only the questions with an answer sent", async () => {
    const finished = await runMockSession(dataAnalystSara);
    expect(answersGiven(null)).toBe(0);
    expect(answersGiven(finished)).toBe(finished.questions.length);
    expect(answersGiven({ ...finished, turns: [] })).toBe(0);
  });

  it("asks in place, says what is lost and offers a way back", () => {
    const one = renderToStaticMarkup(<ConfirmStartAgain answers={1} onConfirm={noop} onCancel={noop} />);
    expect(one).toContain("Start again?");
    expect(one).toContain("You&#x27;ll lose your answer and its feedback.");
    // The button says what it does on its own, as a screen reader's list of buttons reads it (#281).
    expect(one.indexOf(">Start again with new questions</button>")).toBeLessThan(one.indexOf(">Keep going</button>"));

    const three = renderToStaticMarkup(<ConfirmStartAgain answers={3} onConfirm={noop} onCancel={noop} />);
    expect(three).toContain("You&#x27;ll lose your 3 answers and their feedback.");
    expect(three).not.toContain("submitted");
  });

  it("is a group named by its question and described by what is lost, which takes focus, so both are heard (#281)", () => {
    const html = renderToStaticMarkup(<ConfirmStartAgain answers={2} onConfirm={noop} onCancel={noop} />);
    expect(html).toMatch(/^<div role="group" tabindex="-1" aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
    const named = (attribute: string) => html.match(new RegExp(`id="${html.match(new RegExp(`${attribute}="([^"]+)"`))![1]}"[^>]*>([^<]*)<`))?.[1];
    expect(named("aria-labelledby")).toBe("Start again?");
    expect(named("aria-describedby")).toBe("You&#x27;ll lose your 2 answers and their feedback.");
  });

  it("says an answer still being written is lost too (#269 review)", () => {
    const draftOnly = renderToStaticMarkup(<ConfirmStartAgain answers={0} hasDraft onConfirm={noop} onCancel={noop} />);
    expect(draftOnly).toContain("Anything you haven&#x27;t submitted will be lost.");
    expect(draftOnly).not.toContain("You&#x27;ll lose your");

    const both = renderToStaticMarkup(<ConfirmStartAgain answers={2} hasDraft onConfirm={noop} onCancel={noop} />);
    expect(both).toContain(
      "You&#x27;ll lose your 2 answers and their feedback. Anything you haven&#x27;t submitted will be lost too.",
    );
  });
});
