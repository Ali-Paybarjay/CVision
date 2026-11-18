// The report after "End here" (#205): answered questions keep today's card, the others show a suggested answer. A
// skipped question (#530) says "Skipped" and has no score.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewSession } from "@/features/interview/contracts";
import {
  addAnswer,
  applyEvaluation,
  applyFollowUpDecision,
  applySuggestion,
  askQuestion,
  endEarly,
  endIfSkipped,
  mainAnswer,
  missingSuggestionIds,
  nextStep,
  skipQuestion,
} from "@/features/interview/engine/session";
import { evaluateAnswer, fallbackSuggestion, suggestAnswer, suggestionContext } from "@/features/interview/engine/stages";
import { dataAnalystSara as fixture } from "@/features/interview/fixtures/data-analyst-sara";
import { endedSessionFor, inputsFor, readySessionFor, runMockSession } from "@/features/interview/test-support";
import { FeedbackReport, placeholderParts } from "./report";

const inputs = inputsFor(fixture);
const later = "2026-10-21T10:30:00.000Z";

/** An ended session with every suggestion written (mock: the hand-checked ones for q1, q3 and q6, the safe version elsewhere). */
async function withSuggestions(session: InterviewSession) {
  let done = session;
  for (const id of missingSuggestionIds(session)) done = applySuggestion(done, (await suggestAnswer(done, id, inputs)).suggestion);
  return done;
}

describe("the report after 'End here'", () => {
  it("with no answers: no score, the CV summary, and a suggested answer for every question", async () => {
    const html = renderToStaticMarkup(<FeedbackReport session={await withSuggestions(endedSessionFor(fixture))} />);
    expect(html).toContain("there is no score");
    expect(html).toContain("From your profile");
    expect(html).toContain("Where your profile is strongest");
    expect(html.match(/Not answered/g)).toHaveLength(6);
    expect(html).not.toContain("Overall score");
  });

  it("highlights each placeholder and puts the honest line in the candidate's choice", async () => {
    const html = renderToStaticMarkup(<FeedbackReport session={await withSuggestions(endedSessionFor(fixture))} />);
    expect(html).toContain("Read a suggested answer");
    expect(html).toMatch(/<mark[^>]*>\[how you checked the automated figures against the manual report before switching over\]<\/mark>/);
    expect(html).toContain("If you have done this, use your own example. If not, say it plainly: “I haven&#x27;t worked with NHS or patient data yet.”");
    expect(html).toContain("From your profile: <q");
    // q1 has placeholders to swap; q3's answer has none.
    expect(html).toContain("Swap each highlighted part for your own detail");
    expect(html).toContain("Say it in your own words, and leave out anything that isn&#x27;t true.");
  });

  it("with some answers: the score of those only, and today's card for each of them", async () => {
    const full = await runMockSession(fixture);
    // The same answers to q1 and q2, then "End here" at q3.
    const keep = new Set(["q1", "q2"]);
    const partial = {
      ...full,
      report: undefined,
      summary: null,
      turns: full.turns!.filter((t) => keep.has(t.questionId) || (t.questionId === "q3" && t.speaker === "interviewer" && t.kind === "main")),
      followUpDecisions: full.followUpDecisions!.filter((d) => keep.has(d.questionId)),
      evaluations: [],
      answers: full.answers.filter((a) => keep.has(a.questionId)),
    };
    let session = endEarly(partial, later);
    for (const id of ["q1", "q2"]) session = applyEvaluation(session, (await evaluateAnswer(session, id)).evaluation);
    session = await withSuggestions(session);

    const html = renderToStaticMarkup(<FeedbackReport session={session} />);
    expect(html).toContain("Based on the 2 of 6 questions you answered");
    expect(html).not.toContain("From your profile</h2>");
    expect(html.match(/Not answered/g)).toHaveLength(4);
    expect(html.match(/Do this next time/g)).toHaveLength(2);
    expect(html).toContain(mainAnswer(session, "q1")!.slice(0, 40).replace(/'/g, "&#x27;"));
  });

  it("shows the safe version's points and says why there is no sample answer", () => {
    const ended = endedSessionFor(fixture);
    const session = applySuggestion(ended, fallbackSuggestion(suggestionContext(ended, "q2", inputs)));
    const html = renderToStaticMarkup(<FeedbackReport session={session} />);
    expect(html).toContain("We couldn&#x27;t write a suggested answer we could check against your profile.");
    expect(html).not.toContain("Read a suggested answer");
  });

  it("leaves the full report unchanged when every question was answered", async () => {
    const html = renderToStaticMarkup(<FeedbackReport session={await runMockSession(fixture)} />);
    expect(html).toContain("Overall score");
    expect(html).not.toContain("Not answered");
    expect(html).not.toContain("Based on the");
  });

  it("renders nothing for a practice that is still going", () => {
    expect(renderToStaticMarkup(<FeedbackReport session={readySessionFor(fixture)} />)).toBe("");
  });
});

describe("the report after 'Skip this question' (#530)", () => {
  const at = "2026-11-18T20:00:00.000Z";
  /** Asks the next question, as the page does once one is finished. */
  const askNext = (session: InterviewSession) => {
    const next = nextStep(session);
    return next.step === "ask" ? askQuestion(session, next.questionId, at, `${next.questionId}-asked`) : session;
  };
  /** Skips each question in turn; the last skip ends the practice as the page does. */
  const skipRest = (session: InterviewSession) => {
    let skipped = session;
    for (let next = nextStep(skipped); next.step === "answer"; next = nextStep(skipped)) skipped = askNext(skipQuestion(skipped, next.questionId, at));
    return endIfSkipped(skipped, at);
  };

  it("with every question skipped: 'Skipped' on each, a suggested answer for each, and no score", async () => {
    const session = await withSuggestions(skipRest(askNext(readySessionFor(fixture))));
    const html = renderToStaticMarkup(<FeedbackReport session={session} />);
    expect(html.match(/<\/svg>Skipped<\/span>/g)).toHaveLength(6);
    expect(html).not.toContain("Not answered");
    expect(html).toContain("No question was answered, so there is no score.");
    expect(html).not.toContain("You ended before answering");
    expect(html.match(/Read a suggested answer/g)?.length).toBeGreaterThan(0);
    expect(html).not.toContain("Overall score");
    expect(html).not.toContain("Do this next time");
  });

  it("with one answer and the rest skipped: that answer's score and card, and 'Skipped' with no score for the others", async () => {
    let session = askNext(readySessionFor(fixture));
    session = addAnswer(session, { questionId: "q1", kind: "main", text: fixture.answers.q1.main, startedAt: at, submittedAt: at, id: "q1-answer" });
    session = askNext(applyFollowUpDecision(session, { questionId: "q1", askFollowUp: false, gapType: "none", usedFallback: false, reason: "Moving on." }, at, "q1-decision"));
    session = skipRest(session);
    session = applyEvaluation(session, (await evaluateAnswer(session, "q1")).evaluation);
    session = await withSuggestions(session);

    const html = renderToStaticMarkup(<FeedbackReport session={session} />);
    expect(html).toContain("Based on the 1 of 6 questions you answered");
    expect(html).toContain("every question you didn&#x27;t answer has a suggested answer built from your profile");
    expect(html).not.toContain("You ended the practice early");
    expect(html.match(/<\/svg>Skipped<\/span>/g)).toHaveLength(5);
    expect(html.match(/Do this next time/g)).toHaveLength(1);
  });

  it("keeps 'Not answered' and today's words after 'End here' with nothing skipped", async () => {
    const html = renderToStaticMarkup(<FeedbackReport session={await withSuggestions(endedSessionFor(fixture))} />);
    expect(html).not.toContain("Skipped");
    expect(html).toContain("You ended before answering, so there is no score.");
  });
});

describe("placeholders in a sample answer", () => {
  it("splits out each [placeholder]", () => {
    expect(placeholderParts("I cut it to [the time] by [how].")).toEqual([
      { text: "I cut it to ", placeholder: false },
      { text: "[the time]", placeholder: true },
      { text: " by ", placeholder: false },
      { text: "[how]", placeholder: true },
      { text: ".", placeholder: false },
    ]);
  });
});

describe("readiness in design A (#275)", () => {
  /** The chip beside the overall score. */
  const chip = (html: string, label: string) => html.match(new RegExp(`<span class="[^"]*">(?:<svg(?:(?!</svg>).)*</svg>)${label}</span>`))?.[0] ?? "";

  it("shows 'Not yet ready' in Amber, as red is kept for things that went wrong", async () => {
    const finished = await runMockSession(fixture);
    const html = renderToStaticMarkup(<FeedbackReport session={{ ...finished, report: { ...finished.report!, readiness: "not-yet-ready" } }} />);
    const notYet = chip(html, "Not yet ready");
    expect(notYet).toContain("bg-warning-bg text-warning");
    expect(notYet).not.toContain("error");
  });

  it("gives 'Nearly ready' a Teal edge and 'Ready' Fit with a tick", async () => {
    const finished = await runMockSession(fixture);
    const nearly = renderToStaticMarkup(<FeedbackReport session={{ ...finished, report: { ...finished.report!, readiness: "nearly-ready" } }} />);
    expect(chip(nearly, "Nearly ready")).toContain("bg-surface text-accent border border-accent");
    const ready = renderToStaticMarkup(<FeedbackReport session={{ ...finished, report: { ...finished.report!, readiness: "ready" } }} />);
    expect(chip(ready, "Ready")).toContain("bg-fit text-accent");
  });
});
