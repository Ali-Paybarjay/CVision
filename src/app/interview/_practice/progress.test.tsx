// "Preparing your interview" (#232): how long is left, which stage is working, what the first stage found, and plain
// words when a stage is slow, is tried again or needs Try again.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { endedSessionFor, readySessionFor, runMockSession } from "@/features/interview/test-support";
import { keptLine, preparationState, Progress, scoringLine, startupEstimate, startupFraction, timeLeft, veryLateMessage } from "./progress";
import { stepProblems, type JobState, type PracticeStore } from "./store";

const startedAtMs = Date.parse("2026-10-30T21:00:00Z");
const run = String(startedAtMs);
const store = {} as PracticeStore;

const ready = readySessionFor(dataAnalystSara);
/** After stage 1: the role and the CV are read, no questions yet. */
const analysed = { ...ready, questions: [], blueprint: undefined, reviewChangelog: undefined };
/** After stage 2: the questions are written, not yet checked. */
const written = { ...ready, reviewChangelog: undefined };

/** A stage's request running in this tab since `sinceSeconds` after Start. */
function running(stage: string, sinceSeconds: number, retrying = false): Record<string, JobState> {
  return { [`${run}:${stage}`]: { status: "running", since: startedAtMs + sinceSeconds * 1000, retrying } };
}

function failed(stage: string, message: string, final = false, limit = false): Record<string, JobState> {
  return { [`${run}:${stage}`]: { status: "failed", message, ...(final && { final }), ...(limit && { limit }) } };
}

/** The card `seconds` after Start. */
function render(session: Parameters<typeof Progress>[0]["session"], seconds: number, jobs: Record<string, JobState> = {}) {
  vi.setSystemTime(startedAtMs + seconds * 1000);
  return renderToStaticMarkup(<Progress store={store} session={session} jobs={jobs} run={run} />);
}

beforeEach(() => {
  // Only the clock: the mock session runs on real promises.
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the bar", () => {
  it("fills by the working stage's own clock, never past that stage, and is full only when the questions are ready", () => {
    expect(startupFraction(0, 0)).toBe(0);
    // Reading the role has a fifth of the usual 2 minutes (24 seconds); writing and checking two fifths each (#266).
    expect(startupFraction(0, 12_000)).toBeCloseTo(0.1);
    // A stage that finishes early moves it on at once.
    expect(startupFraction(1, 0)).toBeCloseTo(0.2);
    expect(startupFraction(1, 24_000)).toBeCloseTo(0.4);
    // Late: it waits just short of the stage's end.
    expect(startupFraction(2, 200_000)).toBeCloseTo(0.6 + 0.9 * 0.4);
    expect(startupFraction(3, 0)).toBe(1);
  });
});

describe("the time left", () => {
  it("starts at the usual 2 minutes, counts down in tens of seconds, then says it is almost ready", () => {
    expect(startupEstimate()).toBe("about 2 minutes");
    expect(timeLeft(0, 0)).toBe("About 2 minutes left");
    expect(timeLeft(1, 10_000)).toBe("About 90 seconds left");
    expect(timeLeft(1, 40_000)).toBe("About 60 seconds left");
    expect(timeLeft(2, 25_000)).toBe("About 30 seconds left");
    expect(timeLeft(2, 40_000)).toBe("Almost ready");
  });

  it("says a slow stage is slow as soon as it runs past its usual share, rather than standing still on a number", () => {
    // Reading the role usually takes 24 seconds, so it is slow 10 seconds after that.
    expect(timeLeft(0, 34_000)).toBe("About 2 minutes left");
    expect(timeLeft(0, 35_000)).toBe("Taking a little longer than usual");
    // A slow last stage would otherwise sit on "Almost ready".
    expect(timeLeft(2, 58_000)).toBe("Almost ready");
    expect(timeLeft(2, 59_000)).toBe("Taking a little longer than usual");
    // Past twice its share, "a little" would no longer be true.
    expect(timeLeft(1, 106_000)).toBe("Taking a little longer than usual");
    expect(timeLeft(1, 107_000)).toBe("Taking longer than usual");
  });

  it("does not call an ordinary start slow: writing the questions has two fifths of the wait, not a third (#266)", () => {
    // 55 seconds of writing or checking used to say "Taking a little longer than usual".
    expect(timeLeft(1, 55_000)).toBe("About 50 seconds left");
    expect(timeLeft(2, 55_000)).toBe("Almost ready");
  });
});

describe("what answers are scored on (#266)", () => {
  it("names one rubric's criteria while only technical questions are asked, and each category's once STAR questions are too", () => {
    expect(scoringLine({ technical: 6, behavioural: 0 })).toBe(
      "Each answer is scored on technical accuracy, depth of reasoning, applied evidence and clarity.",
    );
    expect(scoringLine({ technical: 4, behavioural: 2 })).toBe(
      "Technical answers are scored on technical accuracy, depth of reasoning, applied evidence and clarity; behavioural answers on relevance to the job, STAR structure, evidence and examples and clarity.",
    );
    expect(scoringLine({ technical: 0, behavioural: 6 })).toBe(
      "Each answer is scored on relevance to the job, STAR structure, evidence and examples and clarity.",
    );
  });
});

describe("where the start is", () => {
  it("is preparing while stages run, even on a second try, failed when one needs Try again, and ready when checked", () => {
    expect(preparationState(null, {}, run)).toBe("preparing");
    expect(preparationState(analysed, running("generate", 40, true), run)).toBe("preparing");
    expect(preparationState(analysed, failed("generate", "No."), run)).toBe("failed");
    expect(preparationState(ready, {}, run)).toBe("ready");
  });
});

describe("Preparing your interview", () => {
  it("at the start: the usual wait, the first stage working, the others waiting, and what answers are scored on", () => {
    const html = render(null, 0, running("analyse", 0));

    // The heading takes focus once "Start practice" is gone.
    expect(html).toMatch(/<h2 tabindex="-1" class="text-xl">Preparing your interview<\/h2>/);
    expect(html).toContain("About 2 minutes left");
    expect(html).toMatch(/Working…<\/span><span class="font-semibold">Reading the role and your profile/);
    expect(html).toMatch(/Waiting<\/span><span class="text-text-muted">Writing 6 questions for this job/);
    expect(html).toMatch(/Waiting<\/span><span class="text-text-muted">Checking each question is clear, fair and at the right level/);
    // Only the ring turns, never the words: their contrast stays at the brand's level.
    expect(html).toContain("motion-safe:animate-spin");
    expect(html).not.toContain("animate-pulse");
    // The bar's empty track can be seen.
    expect(html).toContain("rounded-full border border-line bg-canvas");
    expect(html).toContain("Each answer is scored on technical accuracy, depth of reasoning, applied evidence and clarity.");
    // Nothing is late yet: the line that would say so is there for a screen reader, empty.
    expect(html).not.toContain(veryLateMessage);
    expect(html).toContain("Keep this page open. You can use another tab while you wait.");
    expect(html).not.toContain("What this role asks for");
  });

  it("once the role is read, puts it to use: must-haves first, the level in the ad's words, and lines from the profile", () => {
    // Nice-to-haves first, so the rows are only in order if the card sorts them.
    const competencies = [...analysed.roleProfile!.competencies].reverse();
    const html = render({ ...analysed, roleProfile: { ...analysed.roleProfile!, competencies } }, 50, running("generate", 40));

    expect(html).toContain("Done</span><span>Reading the role and your profile");
    expect(html).toContain('role="status" class="sr-only">Done: Reading the role and your profile.</p>');
    expect(html).toContain("About 90 seconds left");
    // Only 6 questions are asked, so the card does not promise that each of these is tested.
    expect(html).toContain("<h3>What this role asks for</h3>");
    expect(html).not.toContain("will test");
    const mustHave = competencies.find((c) => c.priority === "must-have")!;
    const niceToHave = competencies.find((c) => c.priority === "nice-to-have")!;
    expect(html.indexOf("Must-have")).toBeLessThan(html.indexOf(`>${mustHave.name}<`));
    expect(html.indexOf(`>${mustHave.name}<`)).toBeLessThan(html.indexOf("Also asked for"));
    expect(html.indexOf("Also asked for")).toBeLessThan(html.indexOf(`>${niceToHave.name}<`));
    // The level in words, never the L2 code, and the ad's own words, which the first stage checks.
    expect(html).toContain("Pitched at a junior level. The ad says: “We are looking for a Junior Data Analyst”");
    expect(html).not.toContain(">L2<");
    expect(html).toContain("<h3>From your profile, the interviewer may ask about</h3>");
    for (const claim of analysed.candidateProfile!.claimsToProbe) expect(html).toContain(`“${claim.quote}”`);
    expect(html).toContain("While you wait, think of the numbers behind these lines and your own part in each.");
    // The line beside each list names it, and the list has no name of its own to read again (#266).
    expect(html).toMatch(/<p class="[^"]*">Must-have<\/p><ul class=/);
    expect(html).not.toContain("aria-label=");
    // Never the gaps: a model's judgement, and discouraging just before the practice.
    expect(html).not.toContain(analysed.candidateProfile!.gaps[0].note);
  });

  it("shows at most three lines from the profile, and never the questions while they are written and checked", () => {
    const claims = analysed.candidateProfile!.claimsToProbe;
    const many = [...claims, ...claims.map((claim) => ({ ...claim, id: `${claim.id}-more`, quote: `${claim.quote} again` }))];
    const html = render({ ...written, candidateProfile: { ...written.candidateProfile!, claimsToProbe: many } }, 90, running("review", 80));

    expect(html.match(/border-l-2 border-line pl-3/g)).toHaveLength(3);
    expect(html).not.toContain(" again”");
    for (const question of written.questions) expect(html).not.toContain(question.text.slice(0, 40));
  });

  it("starts the working stage's clock again after a reload or on another day, rather than counting from Start", () => {
    // A day later, with the second stage's request not yet started in this tab.
    const html = render(analysed, 86_400, { [`${run}:generate`]: { status: "running" } });

    expect(html).toContain("About 2 minutes left");
    expect(html).not.toContain("longer than usual");
  });

  it("says plainly when a stage is slow", () => {
    expect(render(analysed, 100, running("generate", 40))).toContain("Taking a little longer than usual");
  });

  it("when a stage is very late, says what happens next, on the card and once out loud, and keeps the way out it has (#266)", () => {
    const html = render(analysed, 150, running("generate", 40));

    expect(html).toContain("Taking longer than usual");
    expect(html).toContain(`<p role="status" class="text-sm">${veryLateMessage(1).replaceAll("'", "&#x27;")}</p>`);
  });

  it("counts the time before a very late stage is stopped from now, which the user can see, not from the stage's start (#281)", () => {
    // Stopped at 180 s; the line comes at twice the stage's share plus 10 s: 58 s into stage 1, 106 s into stages 2 and 3.
    expect(veryLateMessage(0)).toBe("This step is slower than usual. If it isn't done in about 2 minutes, we'll stop it so you can try again.");
    for (const stage of [1, 2]) {
      expect(veryLateMessage(stage)).toBe("This step is slower than usual. If it isn't done in about a minute, we'll stop it so you can try again.");
    }
  });

  it("says when a stage is being tried again, on the stage and out loud, with the time left counted again", () => {
    const html = render(analysed, 110, running("generate", 100, true));

    expect(html).toMatch(/Trying again…<\/span><span class="font-semibold">Writing 6 questions for this job/);
    expect(html).toContain("That step did not finish, so we are running it once more.");
    expect(html).toContain("About 90 seconds left");
    expect(html).toContain('role="status" class="sr-only">Trying again: Writing 6 questions for this job.</p>');
  });

  it("when a stage fails, says what happened, that the steps done are kept, and offers Try again instead of a countdown", () => {
    const html = render(analysed, 200, failed("generate", stepProblems.server));

    expect(html).toContain("Failed</span>");
    expect(html).toContain(stepProblems.server);
    expect(html).toContain("The steps already done are kept.");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toContain("seconds left");
    expect(html).not.toContain("minutes left");
    // A screen reader hears the error too, not only the end of each stage.
    expect(html).toContain(`role="status" class="sr-only">Failed: Writing 6 questions for this job. ${stepProblems.server}</p>`);
  });

  it("offers no Try again when it would only fail the same way, as when the AI service is off (#266)", () => {
    const html = render(analysed, 200, failed("generate", "Interview practice isn’t available right now.", true));

    expect(html).not.toMatch(/<button[^>]*>Try again<\/button>/);
    // With no Try again, it says when to come back instead, not to keep the page open (#281).
    expect(html).toContain("The steps already done are kept. Open this page again later to carry on.");
    expect(html).not.toContain("Keep this page open");
  });

  it("at the daily limit, lets the limit's own words say when to come back, once (#313)", () => {
    const limit = "You have used today's AI requests. Everything you have saved is still here, and you can try again tomorrow.";
    const html = render(analysed, 200, failed("generate", limit, true, true));

    expect(html).toContain("try again tomorrow");
    expect(html).not.toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).toContain("The steps already done are kept.");
    expect(html).not.toContain("Open this page again later");
  });

  it("with no Try again, says what is kept and when to come back (#281)", () => {
    expect(keptLine(0, false)).toBe("");
    expect(keptLine(2, false)).toBe("The steps already done are kept.");
    expect(keptLine(0, true)).toBe("Open this page again later to try again.");
    expect(keptLine(1, true)).toBe("The steps already done are kept. Open this page again later to carry on.");
    // At the daily limit "later" today would only hit the limit again (#313).
    expect(keptLine(1, true, true)).toBe("The steps already done are kept.");
    expect(keptLine(0, true, true)).toBe("");
  });

  it("when the first stage fails, does not talk of steps already done", () => {
    const html = render(null, 40, failed("analyse", stepProblems.offline));

    expect(html).toContain(stepProblems.offline);
    expect(html).not.toContain("The steps already done are kept.");
  });

  it("leaves the page to the first question once the questions are ready, with no start time, and says so out loud (#243)", () => {
    const html = render(ready, 95);

    // The card goes, but the status line outside it stays, so the screen reader hears that question 1 is here. It does
    // not repeat "Question 1 of 6", which the question card shows and the e2e specs look for.
    expect(html).toBe('<p role="status" class="sr-only">Your 6 questions are ready. Question 1 is below.</p>');
  });

  it("says nothing once question 1 is answered or the practice was ended, so a reload later on is quiet", async () => {
    const quiet = '<p role="status" class="sr-only"></p>';

    expect(render(await runMockSession(dataAnalystSara), 95)).toBe(quiet);
    expect(render(endedSessionFor(dataAnalystSara), 95)).toBe(quiet);
  });
});
