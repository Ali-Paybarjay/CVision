import { afterEach, describe, expect, it, vi } from "vitest";
import { limits } from "@/features/interview/config";
import { fixtures } from "@/features/interview/fixtures";
import { endedSessionFor, inputsFor, runMockSession } from "@/features/interview/test-support";
import type { AskModelOptions } from "@/shared/ai";
import { isLabEnabled } from "../lab-access";
import { POST } from "./route";

const currentUser = vi.hoisted(() => ({ value: null as { id: string; email: string | null } | null }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => currentUser.value }));

// Records what each stage passes to askModel. In live mode it stops there, so no request is ever sent.
const asked = vi.hoisted(() => [] as AskModelOptions<never>[]);
vi.mock("@/shared/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/ai")>();
  return {
    ...actual,
    askModel: async (options: AskModelOptions<never>) => {
      asked.push(options);
      if (actual.getAiMode() === "live") throw new actual.AskModelError("No API key in tests.", "no-api-key");
      return actual.askModel(options);
    },
  };
});

const fixture = fixtures[0];
const analyse = (overrides: Partial<ReturnType<typeof inputsFor>> = {}) =>
  POST(
    new Request("http://localhost/interview/lab/api", {
      method: "POST",
      body: JSON.stringify({ step: "analyse", inputs: { ...inputsFor(fixture), ...overrides }, id: "s1", startedAt: "2026-10-21T09:00:00.000Z" }),
    }),
  );
const post = (body: unknown) => POST(new Request("http://localhost/interview/lab/api", { method: "POST", body: JSON.stringify(body) }));

afterEach(() => {
  vi.unstubAllEnvs();
  currentUser.value = null;
  asked.length = 0;
});

describe("the lab API in mock mode", () => {
  it("works without signing in", async () => {
    const response = await analyse();
    expect(response.status).toBe(200);
  });

  it("rejects a CV or job ad over the limit", async () => {
    expect((await analyse({ cv: "x".repeat(limits.cvMaxChars + 1) })).status).toBe(400);
    expect((await analyse({ jobDescription: "x".repeat(limits.jobDescriptionMaxChars + 1) })).status).toBe(400);
  });

  it("rejects a session with an answer over the limit", async () => {
    const session = await runMockSession(fixture);
    const turns = session.turns?.map((t) => (t.speaker === "candidate" ? { ...t, text: "x".repeat(limits.answerMaxChars + 1) } : t));
    const response = await post({ step: "report", session: { ...session, turns } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/too long/);
  });

  it("ends a practice and writes a suggested answer from the CV it is sent (#205)", async () => {
    const session = endedSessionFor(fixture);
    expect(await (await post({ step: "end", session })).json()).toEqual({ ended: true });
    const response = await post({ step: "suggest", inputs: inputsFor(fixture), session, questionId: "q1" });
    expect(response.status).toBe(200);
    expect((await response.json()).suggestion.questionId).toBe("q1");
  });
});

describe("the lab API in live mode", () => {
  it("needs a signed-in user", async () => {
    vi.stubEnv("AI_MODE", "live");
    const response = await analyse();
    expect(response.status).toBe(401);
    expect(asked).toHaveLength(0);
  });

  it("sends the signed-in user to askModel, for the daily limit", async () => {
    vi.stubEnv("AI_MODE", "live");
    currentUser.value = { id: "user-1", email: null };
    const response = await analyse();
    expect(response.status).toBe(422);
    expect(asked[0]?.requester).toEqual({ userId: "user-1" });
  });
});

describe("isLabEnabled", () => {
  it("is off in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isLabEnabled()).toBe(false);
  });

  it("is on in a preview deployment in mock mode", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isLabEnabled()).toBe(true);
  });

  it("needs INTERVIEW_LAB_LIVE=on in a preview deployment in live mode", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("AI_MODE", "live");
    expect(isLabEnabled()).toBe(false);
    vi.stubEnv("INTERVIEW_LAB_LIVE", "on");
    expect(isLabEnabled()).toBe(true);
  });
});
