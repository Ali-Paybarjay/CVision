import { describe, expect, it } from "vitest";
import { sessionCompletedProperties } from "./server/completion-event";
import { fixtures } from "./fixtures";
import { runMockSession } from "./test-support";

describe.each(fixtures)("interview.session_completed for $id", (fixture) => {
  it("has counts and scores, and no question, answer or CV text", async () => {
    const session = await runMockSession(fixture);
    const properties = sessionCompletedProperties(session, session.report!);

    expect(properties).toMatchObject({
      sessionId: session.id,
      jobId: fixture.job.id,
      mode: "mock",
      questions: 6,
      overall: session.report!.overall,
      readiness: session.report!.readiness,
    });
    expect(properties.durationSeconds).toBeGreaterThan(0);

    // Every value is a number, a short id or a label: none of the session's text can leak into the event.
    const sent = JSON.stringify(properties);
    for (const turn of (session.turns ?? []).filter((t) => t.text.length >= 30)) expect(sent).not.toContain(turn.text.slice(0, 30));
    expect(Object.values(properties).every((value) => value === null || typeof value === "number" || String(value).length <= 40)).toBe(true);
  });
});
