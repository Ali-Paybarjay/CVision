// The size limits on a session the browser sends back: everything in it can reach a prompt.
import { describe, expect, it } from "vitest";
import { limits } from "./config";
import { fixtures } from "./fixtures";
import { badRequest, RequestSessionSchema } from "./server/step-api";
import { runMockSession } from "./test-support";

describe("a session sent by the browser", () => {
  it("accepts a finished session with every answer at full length", async () => {
    const full = { main: "a".repeat(limits.answerMaxChars), followUp: "b".repeat(limits.answerMaxChars) };
    for (const fixture of fixtures) {
      expect(RequestSessionSchema.safeParse(await runMockSession(fixture, () => full)).success).toBe(true);
    }
  });

  it("rejects a session padded outside the answers", async () => {
    const session = await runMockSession(fixtures[0]);
    const padded = { ...session, roleProfile: { ...session.roleProfile!, title: "x".repeat(limits.sessionMaxChars) } };
    const parsed = RequestSessionSchema.safeParse(padded);
    expect(parsed.success).toBe(false);
    const response = badRequest(parsed.error!.issues);
    expect(response.status).toBe(400);
  });
});
