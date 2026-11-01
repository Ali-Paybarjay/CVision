// The report after "End here" (#205): answered questions keep today's card, the others show a suggested answer.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InterviewSession } from "@/features/interview/contracts";
import { applyEvaluation, applySuggestion, endEarly, mainAnswer, missingSuggestionIds } from "@/features/interview/engine/session";
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
