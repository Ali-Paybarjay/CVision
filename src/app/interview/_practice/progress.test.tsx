// "Preparing your interview" (#232): how long, a bar that moves, and what the role asks for while the rest runs.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { runMockSession } from "@/features/interview/test-support";
import { Progress, startupFraction, timeLeft } from "./progress";
import type { JobState, PracticeStore } from "./store";

const startedAtMs = Date.parse("2026-10-30T21:00:00Z");
const run = String(startedAtMs);
const store = {} as PracticeStore;

function render(session: Parameters<typeof Progress>[0]["session"], seconds: number, jobs: Record<string, JobState> = {}) {
  vi.setSystemTime(startedAtMs + seconds * 1000);
  return renderToStaticMarkup(<Progress store={store} session={session} jobs={jobs} run={run} startedAtMs={startedAtMs} />);
}

beforeEach(() => {
  // Only the clock: the mock session runs on real promises.
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the bar", () => {
  it("fills with time, but never past the stages that are done, nor short of them", () => {
    expect(startupFraction(0, 0)).toBe(0);
    expect(startupFraction(0, 60_000)).toBeCloseTo(0.3);
    expect(startupFraction(1, 5_000)).toBeCloseTo(1 / 3);
    expect(startupFraction(2, 70_000)).toBeCloseTo(70 / 90);
    // Late: it waits just short of the end until the questions are ready.
    expect(startupFraction(2, 200_000)).toBeCloseTo(2.9 / 3);
  });
});

describe("the time left", () => {
  it("counts down in tens of seconds, then says it is almost ready, then that it is slower than usual", () => {
    expect(timeLeft(0, 0)).toBe("About 90 seconds left");
    expect(timeLeft(1, 31_000)).toBe("About 60 seconds left");
    expect(timeLeft(2, 75_000)).toBe("About 20 seconds left");
    expect(timeLeft(2, 85_000)).toBe("Almost ready");
    expect(timeLeft(2, 115_000)).toBe("Almost ready");
    expect(timeLeft(2, 125_000)).toBe("Taking a little longer than usual");
    expect(timeLeft(0, 125_000)).toBe("Taking a little longer than usual");
  });

  it("follows the bar: jumps when a stage finishes early, waits when one runs late", () => {
    expect(timeLeft(1, 1_000)).toBe("About 60 seconds left");
    expect(timeLeft(0, 60_000)).toBe("About 70 seconds left");
  });
});

describe("Preparing your interview", () => {
  it("says how long it takes and to keep the page open, with the first stage working", () => {
    const html = render(null, 0);

    expect(html).toContain("Preparing your interview");
    expect(html).toContain("About 90 seconds left");
    expect(html).toContain("Keep this page open.");
    expect(html).toMatch(/motion-safe:animate-pulse"><span[^>]*>.*Working…<\/span><\/span><span>Reading the role and your CV/);
    expect(html).not.toContain("This interview will test");
  });

  it("once the role is read, lists what the interview will test, must-haves first", async () => {
    const finished = await runMockSession(dataAnalystSara);
    const competencies = finished.roleProfile!.competencies;
    const html = render({ ...finished, questions: [], reviewChangelog: undefined }, 20);

    expect(html).toContain("Done</span><span>Reading the role and your CV");
    expect(html).toContain('role="status" class="sr-only">Done: Reading the role and your CV.</p>');
    expect(html).toContain("This interview will test");
    for (const competency of competencies) expect(html).toContain(`>${competency.name}</li>`);
    const mustHave = competencies.find((c) => c.priority === "must-have")!;
    const niceToHave = competencies.find((c) => c.priority === "nice-to-have");
    if (niceToHave) expect(html.indexOf(`>${mustHave.name}<`)).toBeLessThan(html.indexOf(`>${niceToHave.name}<`));
  });

  it("when a stage fails, shows the error and Try again instead of a countdown", () => {
    const html = render(null, 40, { [`${run}:analyse`]: { status: "failed", message: "Something went wrong. Try again." } as JobState });

    expect(html).toContain("Failed");
    expect(html).toContain(">Try again</button>");
    expect(html).not.toContain("seconds left");
  });

  it("leaves the page to the first question once the questions are ready, with no start time (#243)", async () => {
    const finished = await runMockSession(dataAnalystSara);
    vi.setSystemTime(startedAtMs + 95_000);

    expect(renderToStaticMarkup(<Progress store={store} session={finished} jobs={{}} run={run} startedAtMs={startedAtMs} />)).toBe("");
  });
});
