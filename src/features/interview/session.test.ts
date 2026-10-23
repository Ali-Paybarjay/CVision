import { describe, expect, it } from "vitest";
import { InterviewSessionSchema as SharedInterviewSessionSchema } from "@/shared/contracts";
import { stageConfig } from "./config";
import { isNewerSession, nextStep, parseSession, serialiseSession } from "./engine/session";
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
    expect(Object.keys(session.versions?.prompts ?? {}).sort()).toEqual(Object.values(stageConfig).map((s) => s.prompt).sort());
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
