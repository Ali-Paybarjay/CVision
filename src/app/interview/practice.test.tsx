// The last practice (#206): the report is read first, and "New practice" sits below it. Where the profile shows (#252):
// a link to it before Start, and the CV sentence a question is written from under the question.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewSession } from "@/features/interview/contracts";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { inputsFor, runMockSession } from "@/features/interview/test-support";
import { InterviewFlow } from "./_practice/flow";
import { createPracticeStore } from "./_practice/store";
import { answersGiven, ConfirmStartAgain, Intro, LastPractice } from "./practice";

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
    expect(one).toContain('tabindex="-1"');
    expect(one).toContain("Start again with new questions?");
    expect(one).toContain("You&#x27;ll lose your answer and its feedback.");
    expect(one.indexOf(">Start again</button>")).toBeLessThan(one.indexOf(">Keep going</button>"));

    const three = renderToStaticMarkup(<ConfirmStartAgain answers={3} onConfirm={noop} onCancel={noop} />);
    expect(three).toContain("You&#x27;ll lose your 3 answers and their feedback.");
    expect(three).not.toContain("submitted");
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

describe("the profile before Start", () => {
  const intro = (canSave: boolean) => renderToStaticMarkup(<Intro signedIn canSave={canSave} onStart={noop} focusHeading={false} />);

  it("says the interviewer reads the profile, not a tailored CV, and links to it in a new tab", () => {
    const html = intro(true);
    expect(html).toContain("The interviewer reads your profile as it is now, not a CV you tailored for a job.");
    const link = html.match(/<a [^>]*>See your profile \(opens in a new tab\)<\/a>/)?.[0] ?? "";
    expect(link).toContain('href="/profile"');
    expect(link).toContain('target="_blank"');
    // Before the button, so it is read before the practice starts.
    expect(html.indexOf("See your profile")).toBeLessThan(html.indexOf(">Start practice</button>"));
  });

  it("is left out for a sample job, which brings its own sample profile", () => {
    expect(intro(false)).not.toContain("See your profile");
  });
});

describe("the CV sentence under a question", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cv = inputsFor(dataAnalystSara).cv;
  const fromCv = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";

  /** Question 2 written from a CV line its text does not repeat; question 1 already says its CV line word for word. */
  async function practised(): Promise<InterviewSession> {
    const session = await runMockSession(dataAnalystSara);
    return {
      ...session,
      questions: session.questions.map((q) => (q.id === "q2" && q.rationale ? { ...q, rationale: { ...q.rationale, cvQuote: "joined weekly sales data" } } : q)),
    };
  }

  function render(session: InterviewSession, cvText: string) {
    vi.stubGlobal("window", new EventTarget());
    const store = createPracticeStore("interview-practice:test", "/interview/api");
    return renderToStaticMarkup(<InterviewFlow store={store} session={session} jobs={{}} run="1" cv={cvText} />);
  }

  it("shows the whole CV sentence under the question it was written from, before the answer", async () => {
    const session = await practised();
    const html = render(session, cv);
    const q2 = session.questions.find((q) => q.id === "q2")!;
    const line = html.indexOf(`From your profile: <q class="italic">${fromCv}</q>`);

    expect(line).toBeGreaterThan(html.indexOf("Question 2 of 6"));
    expect(line).toBeGreaterThan(html.indexOf(q2.text.slice(0, 40)));
    expect(line).toBeLessThan(html.indexOf("Question 3 of 6"));
    // Under the main question only, once, and not under question 1, which already says its line.
    expect(html.match(/From your profile:/g)).toHaveLength(1);
  });

  it("shows nothing once the profile no longer holds the sentence", async () => {
    const html = render(await practised(), cv.replace("joined weekly sales data", "merged weekly sales data"));
    expect(html).not.toContain("From your profile:");
  });
});
