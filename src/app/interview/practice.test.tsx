// The last practice (#206): the report is read first, and "New practice" sits below it. Where the profile shows (#252):
// a link to it before Start, and the profile sentence behind each question in "Why this question" (design A, #275).
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewSession } from "@/features/interview/contracts";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { askQuestion } from "@/features/interview/engine/session";
import { inputsFor, readySessionFor, runMockSession } from "@/features/interview/test-support";
import { InterviewFlow, skipAndAdvance } from "./_practice/flow";
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

  it("does not count a skipped question as an answer to lose (#530)", () => {
    const atFirst = askQuestion(readySessionFor(dataAnalystSara), "q1", "2026-11-18T20:00:00.000Z", "q1-asked");
    expect(answersGiven(skipAndAdvance(atFirst, "q1"))).toBe(0);
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

describe("the question page in design A", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cv = inputsFor(dataAnalystSara).cv;
  const at = "2026-11-03T10:00:00.000Z";

  /** The practice part way through: question 1 answered and scored, question 2 asked and waiting for its answer. */
  async function atQuestion(n: 1 | 2, change: (q: InterviewSession["questions"][number]) => InterviewSession["questions"][number] = (q) => q) {
    const finished = await runMockSession(dataAnalystSara);
    const kept = n === 2 ? [finished.questions[0].id] : [];
    const partial: InterviewSession = {
      ...finished,
      questions: finished.questions.map(change),
      turns: (finished.turns ?? []).filter((t) => kept.includes(t.questionId)),
      followUpDecisions: (finished.followUpDecisions ?? []).filter((d) => kept.includes(d.questionId)),
      evaluations: (finished.evaluations ?? []).filter((e) => kept.includes(e.questionId)),
      report: undefined,
    };
    return askQuestion(partial, finished.questions[n - 1].id, at, `turn-${n}`);
  }

  function render(session: InterviewSession, cvText = cv) {
    vi.stubGlobal("window", new EventTarget());
    const store = createPracticeStore("interview-practice:test", "/interview/api");
    return renderToStaticMarkup(<InterviewFlow store={store} session={session} jobs={{}} run="1" cv={cvText} />);
  }

  it("shows one question on its sheet, with its type and the skill it tests", async () => {
    const session = await atQuestion(2);
    const html = render(session);
    const [q1, q2] = session.questions;
    expect(html).toContain("Question 2 of 6 · Core concept");
    expect(html).toContain("Tests: SQL");
    expect(html).toContain(q2.text);
    // Answered questions leave the sheet: their status stays in the list.
    expect(html).not.toContain(q1.text);
    expect(html).toContain("Your answer</span>");
    expect(html).toContain(">Submit answer</button>");
    expect(html).toContain("About 4 minutes per answer.");
  });

  it("lists the six questions by skill, each with where it is", async () => {
    const html = render(await atQuestion(2));
    expect(html).toContain("Your interview");
    expect(html).toContain("1 of 6 answered");
    expect(html).toMatch(/<li aria-current="step"[^>]*>.*Question 2: <\/span>SQL<\/p><p[^>]*>Answering now<\/p>/);
    expect(html.match(/>Scored</g)).toHaveLength(1);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    // "End here" sits under the list while a question is open.
    expect(html.indexOf("End here and see suggested answers")).toBeGreaterThan(html.indexOf("Your interview"));
  });

  it("says why: the job ad's words and the whole profile sentence behind the skill", async () => {
    const html = render(await atQuestion(2));
    const why = html.slice(html.indexOf("Why this question"));
    expect(why).toContain("From the job ad:</p><q");
    expect(why).toContain("Strong SQL");
    expect(why).toContain(`From your profile:</p><q class="mt-1 block rounded-r-sm border-l-[3px] border-fit-bar bg-fit px-3 py-2 [overflow-wrap:anywhere]">Cleaned and joined weekly sales data from 120 stores using SQL and Python</q>`);
    // The model's own reason is for the interviewer and can give the answer away.
    expect(html).not.toContain("Join fan-out");
  });

  it("prefers the line the question is written from (#252), and leaves it out when the question already says it", async () => {
    const written = await atQuestion(2, (q) => (q.id === "q2" && q.rationale ? { ...q, rationale: { ...q.rationale, cvQuote: "Built Tableau dashboards" } } : q));
    expect(render(written)).toContain(">Built Tableau dashboards for the regional sales team</q>");
    // Question 1 quotes its line word for word.
    expect(render(await atQuestion(1))).not.toContain("From your profile:");
  });

  it("shows nothing from the profile once it no longer holds the line", async () => {
    const html = render(await atQuestion(2), cv.replace("joined weekly sales data", "merged weekly sales data"));
    expect(html).not.toContain("From your profile:");
    expect(html).not.toContain("doesn&#x27;t show this yet");
  });

  it("shows nothing while the questions are prepared, not an empty list or draft questions (#282 review)", async () => {
    const finished = await runMockSession(dataAnalystSara);
    const bare = { ...finished, turns: [], followUpDecisions: [], evaluations: [], report: undefined };
    // After stage 1 (no questions yet), and after stage 2 (draft questions, not reviewed).
    expect(render({ ...bare, questions: [], reviewChangelog: undefined })).toBe("");
    expect(render({ ...bare, reviewChangelog: undefined })).toBe("");
  });

  it("tells a screen reader what came, and reads the question with its label (#282 review)", async () => {
    const html = render(await atQuestion(2));
    expect(html).toContain('<p role="status" class="sr-only">Next question ready</p>');
    expect(html).toMatch(/<h2 id="sheet-q2" tabindex="-1" aria-describedby="sheet-text-q2"/);
    expect(html).toMatch(/<p id="sheet-text-q2"[^>]*>/);
    // Question 1's label is focused as "Preparing your interview" ends and says it itself.
    expect(render(await atQuestion(1))).toContain('<p role="status" class="sr-only"></p>');
  });

  it("says plainly when the profile doesn't show the skill yet", async () => {
    const html = render(await atQuestion(2, (q) => (q.id === "q2" ? { ...q, competencyId: "c5" } : q)));
    expect(html).toContain("Your profile doesn&#x27;t show this yet, so answer from any experience you have, including study or projects.");
  });

  describe("Skip this question (#530)", () => {
    const skipButton = (html: string) => html.match(/<button[^>]*>Skip this question<\/button>/g) ?? [];

    it("sits under the answer as a quiet button, so Coral stays on Submit answer", async () => {
      const html = render(await atQuestion(2));
      expect(skipButton(html)).toHaveLength(1);
      expect(skipButton(html)[0]).toContain("underline-offset-4");
      expect(skipButton(html)[0]).not.toContain("bg-cta");
      expect(html.match(/bg-cta/g)).toHaveLength(1);
      expect(html.indexOf(">Skip this question</button>")).toBeGreaterThan(html.indexOf(">Submit answer</button>"));
      expect(html).toContain("It won&#x27;t be scored. You&#x27;ll get a suggested answer for it at the end.");
    });

    it("is not offered for a follow-up, which is part of the answer already given", async () => {
      const finished = await runMockSession(dataAnalystSara);
      // Question 2's sample answer gets a follow-up: the practice waits for its answer.
      const keep = new Set(["q1", "q2"]);
      const atFollowUp: InterviewSession = {
        ...finished,
        turns: (finished.turns ?? []).filter((t) => keep.has(t.questionId) && !(t.questionId === "q2" && t.speaker === "candidate" && t.kind === "follow-up")),
        followUpDecisions: (finished.followUpDecisions ?? []).filter((d) => keep.has(d.questionId)),
        evaluations: (finished.evaluations ?? []).filter((e) => e.questionId === "q1"),
        report: undefined,
      };
      const html = render(atFollowUp);
      expect(html).toContain("Your answer to the follow-up");
      expect(skipButton(html)).toHaveLength(0);
    });

    it("brings the next question, and the list says the skipped one was skipped, not answered", async () => {
      const html = render(skipAndAdvance(await atQuestion(2), "q2"));
      expect(html).toContain("Question 3 of 6");
      expect(html).toContain("1 of 6 answered");
      expect(html).toMatch(/Question 2: <\/span>SQL<\/p><div[^>]*>Skipped<\/div>/);
      expect(html.match(/>Scored</g)).toHaveLength(1);
    });
  });
});
