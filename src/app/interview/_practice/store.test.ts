// callStep (#232): the API's own words when it has them, plain words when it has none (never a status code), a time
// limit for the start-up stages, and which failures are worth a second go.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPracticeStore, parseEnvelope, StepError, stepProblems } from "./store";

const callStep = (options?: { timeoutMs?: number }) =>
  createPracticeStore("interview-practice:test", "/interview/api").callStep({ step: "generate" }, options);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("callStep", () => {
  it("returns the step's answer", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ session: { id: "s1" } }));

    await expect(callStep()).resolves.toEqual({ session: { id: "s1" } });
  });

  it("passes on the API's own message, and its word that a second go may well work", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "We could not finish writing your questions this time.", retryable: true }, { status: 422 }));

    await expect(callStep()).rejects.toEqual(new StepError("We could not finish writing your questions this time.", true));
    await expect(callStep()).rejects.toMatchObject({ retryable: true });
  });

  it("offers no second go when the API refuses, as at a daily limit or with no Profile", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "You have reached today's limit." }, { status: 422 }));
    await expect(callStep()).rejects.toMatchObject({ message: "You have reached today's limit.", retryable: false, final: false });

    // The API's word that Try again now would only fail the same way (#266) wins over anything else it says.
    vi.stubGlobal("fetch", async () => Response.json({ error: "You have reached today's limit.", final: true, retryable: true }, { status: 429 }));
    await expect(callStep()).rejects.toMatchObject({ retryable: false, final: true });

    vi.stubGlobal("fetch", async () => Response.json({ error: "We could not find your Profile." }, { status: 404 }));
    await expect(callStep()).rejects.toMatchObject({ retryable: false });
  });

  it("says something went wrong on our side, not a status code, when the platform fails with a page of its own", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>504 Gateway Timeout</html>", { status: 504, headers: { "content-type": "text/html" } }));

    const error = await callStep().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ message: stepProblems.server, retryable: true });
    expect((error as Error).message).not.toContain("504");
  });

  it("says the connection dropped when no answer comes at all", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(callStep()).rejects.toMatchObject({ message: stepProblems.offline, retryable: true });
  });

  it("drops a request that has not answered within its time limit, and offers no second go by itself", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        }),
    );

    // The server is most likely still working on it: sending it again would pay for the model twice.
    const answer = expect(callStep({ timeoutMs: 180_000 })).rejects.toMatchObject({ message: stepProblems.timeout, retryable: false });
    await vi.advanceTimersByTimeAsync(179_999);
    await vi.advanceTimersByTimeAsync(1);
    await answer;
  });

  it("gives a request without a time limit no signal, so the steps after the start are never cut off", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => (signals.push(init.signal), Response.json({})));

    await callStep();
    await callStep({ timeoutMs: 1000 });
    expect(signals[0]).toBeUndefined();
    expect(signals[1]).toBeInstanceOf(AbortSignal);
  });
});

describe("a saved practice", () => {
  it("keeps the stage times that are counts, and drops the rest (#266)", () => {
    const saved = (stageMs: unknown) =>
      parseEnvelope(JSON.stringify({ sourceId: "job-1", inputs: null, session: null, startedAtMs: 1, startupMs: null, stageMs }));

    expect(saved({ analyse: 24_000, generate: 51_000 })?.stageMs).toEqual({ analyse: 24_000, generate: 51_000 });
    expect(saved({ analyse: "soon", generate: -1, review: 3 })?.stageMs).toEqual({});
    expect(saved(undefined)).not.toHaveProperty("stageMs");
  });
});
