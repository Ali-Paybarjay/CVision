import { describe, expect, it } from "vitest";
import { InterviewSessionSchema as SharedInterviewSessionSchema } from "@/shared/contracts";
import { stageConfig } from "./config";
import { isNewerSession, nextStep, openingView, parseSession, serialiseSession } from "./engine/session";
import { fixtures } from "./fixtures";
import { runMockSession } from "./test-support";

describe.each(fixtures)("a full mock session for $id", (fixture) => {
  it("runs from analysis to report with at most one follow-up per question", async () => {
    const session = await runMockSession(fixture);
    expect(nextStep(session)).toEqual({ step: "done" });
    expect(session.questions).toHaveLength(6);
    expect(session.evaluations).toHaveLength(6);
    for (const question of session.questions) {
      const followUps = (session.turns ?? []).filter((t) => t.questionId === question.id && t.kind === "follow-up" && t.speaker === "interviewer");
      expect(followUps.length).toBeLessThanOrEqual(1);
    }
    // In mock mode with the sample answers, the report is the fixture's.
    expect(session.report?.verdict).toBe(fixture.report.verdict);
    expect(session.reviewChangelog).toEqual(fixture.review.changelog);
  });

  it("round-trips through serialisation, with every turn ready for phase 2", async () => {
    const session = await runMockSession(fixture);
    const restored = parseSession(serialiseSession(session));
    expect(restored).toEqual(session);
    expect(restored.turns?.length).toBeGreaterThanOrEqual(12);
    for (const turn of restored.turns ?? []) {
      expect(turn.inputMode).toBe("text");
      expect(turn.audioRef).toBeNull();
    }
  });

  it("keeps what phase 2 needs to replay or re-score it", async () => {
    const session = await runMockSession(fixture);
    expect(session.plan).toEqual({ composition: { technical: 6, behavioural: 0 }, roleLevel: fixture.analyse.roleProfile.roleLevel });
    expect(session.questions.every((q) => (q.followUps?.length ?? 0) >= 2)).toBe(true);
    expect(session.followUpDecisions?.length).toBe(6);
    // Every stage of a full session; suggested answers come only after "End here" (#205).
    const fullSessionPrompts = Object.values(stageConfig).map((s) => s.prompt).filter((prompt) => prompt !== stageConfig.suggest.prompt);
    expect(Object.keys(session.versions?.prompts ?? {}).sort()).toEqual(fullSessionPrompts.sort());
    expect(session.versions?.mode).toBe("mock");
    expect(session.usage?.every((u) => u.estimated && u.inputTokens > 0)).toBe(true);
  });

  it("still matches the shared InterviewSession contract, with the original fields filled in", async () => {
    const session = await runMockSession(fixture);
    const shared = SharedInterviewSessionSchema.parse(session);
    expect(shared.answers).toHaveLength(6);
    expect(shared.answers.every((a) => a.feedback !== null && a.scores === null)).toBe(true);
    expect(shared.summary).toBe(session.report?.verdict);
    expect(shared.questions.every((q) => q.kind === "technical" || q.kind === "problem-solving")).toBe(true);
  });
});

describe("resuming a saved session", () => {
  it("rejects a saved session that does not match the contract", () => {
    expect(() => parseSession(JSON.stringify({ id: "x" }))).toThrow();
  });
});

describe("two copies of a session from different devices", () => {
  it("keeps the one that went further, or the later practice", async () => {
    const finished = await runMockSession(fixtures[0]);
    const earlier = { ...finished, turns: finished.turns?.slice(0, 4), evaluations: [], report: undefined };
    expect(isNewerSession(finished, earlier)).toBe(true);
    expect(isNewerSession(earlier, finished)).toBe(false);
    expect(isNewerSession(finished, finished)).toBe(false);
    const later = { ...earlier, id: "another", startedAt: "2026-10-23T09:00:00.000Z" };
    expect(isNewerSession(later, finished)).toBe(true);
  });
});

describe("what the practice page for a job opens on (#206)", () => {
  it("shows this browser's practice, or the account's copy when it went further", async () => {
    const finished = await runMockSession(fixtures[0]);
    const earlier = { ...finished, turns: finished.turns?.slice(0, 4), evaluations: [], report: undefined };
    const base = { saved: null, lastReport: null, practiseAgain: false, practising: false };
    expect(openingView({ ...base, inBrowser: { session: earlier } })).toBe("browser");
    expect(openingView({ ...base, inBrowser: { session: null }, saved: finished })).toBe("browser");
    expect(openingView({ ...base, inBrowser: { session: earlier }, saved: finished })).toBe("resume");
    // A finished practice in this browser is the latest report, so it is shown as it is.
    expect(openingView({ ...base, inBrowser: { session: finished }, saved: earlier, lastReport: finished })).toBe("browser");
  });

  it("from a link to the job, shows the last report, even over an unfinished practice", async () => {
    const finished = await runMockSession(fixtures[0]);
    const unfinished = { ...finished, id: "another", startedAt: "2026-10-23T09:00:00.000Z", evaluations: [], report: undefined };
    const base = { lastReport: finished, practiseAgain: false, practising: false };
    expect(openingView({ ...base, inBrowser: null, saved: finished })).toBe("last-report");
    expect(openingView({ ...base, inBrowser: null, saved: unfinished })).toBe("last-report");
    expect(openingView({ ...base, inBrowser: { session: unfinished }, saved: finished })).toBe("last-report");
    // Left while the questions were still being written.
    expect(openingView({ ...base, inBrowser: { session: null }, saved: finished })).toBe("last-report");
  });

  it("with no report yet, resumes an unfinished practice", async () => {
    const finished = await runMockSession(fixtures[0]);
    const unfinished = { ...finished, evaluations: [], report: undefined };
    const base = { lastReport: null, practiseAgain: false, practising: false };
    expect(openingView({ ...base, inBrowser: null, saved: unfinished })).toBe("resume");
    expect(openingView({ ...base, inBrowser: null, saved: null })).toBe("intro");
  });

  it("once this tab chose the practice, stays on it, through a reload too", async () => {
    const finished = await runMockSession(fixtures[0]);
    const unfinished = { ...finished, id: "another", startedAt: "2026-10-23T09:00:00.000Z", evaluations: [], report: undefined };
    const base = { lastReport: finished, practiseAgain: false, practising: true };
    expect(openingView({ ...base, inBrowser: { session: unfinished }, saved: finished })).toBe("browser");
    expect(openingView({ ...base, inBrowser: { session: null }, saved: finished })).toBe("browser");
    expect(openingView({ ...base, inBrowser: null, saved: unfinished })).toBe("resume");
  });

  it("after New practice, goes to the intro instead of back to the same report or the unfinished practice", async () => {
    const finished = await runMockSession(fixtures[0]);
    const unfinished = { ...finished, id: "another", startedAt: "2026-10-23T09:00:00.000Z", evaluations: [], report: undefined };
    const base = { inBrowser: null, lastReport: finished, practiseAgain: true, practising: false };
    expect(openingView({ ...base, saved: finished })).toBe("intro");
    expect(openingView({ ...base, saved: unfinished })).toBe("intro");
    // Then "Start practice": the new practice in this browser.
    expect(openingView({ ...base, inBrowser: { session: null }, saved: unfinished, practising: true })).toBe("browser");
  });
});
