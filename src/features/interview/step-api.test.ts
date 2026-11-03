// The size limits on a session the browser sends back: everything in it can reach a prompt.
import { describe, expect, it, vi } from "vitest";
import { AskModelError } from "@/shared/ai";
import { limits } from "./config";
import { fixtures } from "./fixtures";
import { questionsNotWritten } from "./engine/stages";
import { badRequest, practiceUnavailable, RequestSessionSchema, stepDeclined, stepFailed } from "./server/step-api";
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

describe("a step whose answer broke a rule twice (#220)", () => {
  const invalid = new AskModelError("The interview-review answer did not match its schema: questions.4.followUps.0.text: Must be one question.", "invalid-answer");

  it("shows the user a plain message, not the rule, and logs the rule", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = stepFailed("interview", "review", invalid, { plain: true });
    expect(response.status).toBe(422);
    // It usually works on the second go, so the page sends a start-up stage once more by itself (#232).
    expect(await response.json()).toEqual({ error: questionsNotWritten, retryable: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("questions.4.followUps.0.text: Must be one question."));
  });

  it("gives the later steps a plain message of their own", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const evaluate = (await stepFailed("interview", "evaluate", invalid, { plain: true }).json()).error;
    expect(evaluate).toBe("We could not score this answer this time. Try again: it usually works on the second go.");
    expect((await stepFailed("interview", "report", invalid, { plain: true }).json()).error).toMatch(/^We could not write your report/);
  });

  it("still shows the rule in the lab", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await stepFailed("interview lab", "review", invalid).json()).error).toBe(invalid.message);
  });
});

describe("other failures (#232)", () => {
  it("an unexpected one, such as the model's API being overloaded: plain words for the user, the step in the lab, and worth a second go", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const overloaded = new Error("529 Overloaded");

    const user = stepFailed("interview", "generate", overloaded, { plain: true });
    expect(user.status).toBe(500);
    expect(await user.json()).toEqual({ error: questionsNotWritten, retryable: true });
    expect(await stepFailed("interview", "suggest", overloaded, { plain: true }).json()).toEqual({
      error: "We could not finish this step this time. Try again: it usually works on the second go.",
      retryable: true,
    });
    expect(await stepFailed("interview lab", "generate", overloaded).json()).toEqual({ error: "The generate step failed. Try again.", retryable: true });
  });

  it("a daily limit: the reason as it is, with no Try again, since it would only fail the same way (#266)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limit = new AskModelError("You have reached today's limit for interview practice.", "limit-reached");

    const response = stepFailed("interview", "generate", limit, { plain: true });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: limit.message, final: true });
  });

  it("a refusal: plain words for the user, not the model's feature name, and no second go by itself (#266)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = new AskModelError("The model declined the interview-analyse request.", "refused");

    const user = await stepFailed("interview", "analyse", refused, { plain: true }).json();
    expect(user).toEqual({ error: stepDeclined });
    expect(user.error).not.toContain("interview-analyse");
    expect((await stepFailed("interview lab", "analyse", refused).json()).error).toBe(refused.message);
  });
});

/** An error as the AI service's SDK throws it: a class of its own with the HTTP status. */
function serviceError(status: number): Error {
  return Object.assign(new Error(`${status} {"error":{"message":"…"}}`), { name: "APIError", status });
}

describe("the AI service's own answers (#266)", () => {
  it("worth a second go only when the service is busy or failing, or the connection dropped", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [500, 502, 503, 529, 429, 408]) {
      expect(await stepFailed("interview", "generate", serviceError(status), { plain: true }).json()).toEqual({ error: questionsNotWritten, retryable: true });
    }
    const dropped = Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
    expect(await stepFailed("interview", "generate", dropped, { plain: true }).json()).toMatchObject({ retryable: true });
  });

  it("turned away (out of credit, a bad key, a bad request): plain words, no second go and no Try again", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [400, 401, 402, 403]) {
      const response = stepFailed("interview", "generate", serviceError(status), { plain: true });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: practiceUnavailable, final: true });
    }
    // The log says which, for whoever looks into it; the lab says it too.
    expect(log).toHaveBeenCalledWith("interview: generate failed (APIError, HTTP 402)");
    expect((await stepFailed("interview lab", "generate", serviceError(402)).json()).error).toBe(
      "The generate step failed: the AI service answered 402.",
    );
  });

  it("no AI key on the server: plain words for the user, never the setting's name", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const noKey = new AskModelError("AI_MODE is live but neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set.", "no-api-key");

    expect(await stepFailed("interview", "analyse", noKey, { plain: true }).json()).toEqual({ error: practiceUnavailable, final: true });
  });
});
