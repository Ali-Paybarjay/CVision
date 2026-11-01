// drive() with the real store: the page calls drive again after every change. After "End here" (#205), and the three
// start-up stages, which get one more go after a failure worth it (#232).
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextStep } from "@/features/interview/engine/session";
import { dataAnalystSara as fixture } from "@/features/interview/fixtures/data-analyst-sara";
import { endedSessionFor, readySessionFor } from "@/features/interview/test-support";
import { drive, retryStartupStage } from "./flow";
import { createPracticeStore, stepProblems, type PracticeStore } from "./store";

// No pause before a start-up stage's second go, so the tests need no fake clock.
vi.mock("@/features/interview/config", async (importOriginal) => ({ ...(await importOriginal<object>()), startupRetryDelayMs: 0 }));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Lets every pending request and re-drive settle. */
async function settle() {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A store whose session drives itself, as on the page. No localStorage here, so it keeps the session in memory. */
function drivenStore(session: ReturnType<typeof readySessionFor> | null, startedAtMs = 1): PracticeStore {
  vi.stubGlobal("window", new EventTarget());
  const store = createPracticeStore("interview-practice:test", "/interview/api");
  store.writeEnvelope({ sourceId: "job-1", inputs: null, session, startedAtMs, startupMs: null });
  store.subscribe(() =>
    setTimeout(() => {
      const envelope = store.readEnvelope();
      if (envelope) drive(store, envelope, { jobId: "job-1" });
    }),
  );
  drive(store, store.readEnvelope()!, { jobId: "job-1" });
  return store;
}

const ready = readySessionFor(fixture);
/** After stage 1: the role and the CV are read, no questions yet. */
const analysed = { ...ready, questions: [], blueprint: undefined, reviewChangelog: undefined };
/** After stage 2: the questions are written, not yet checked. */
const written = { ...ready, reviewChangelog: undefined };

describe("the start-up stages (#232)", () => {
  it("send a stage once more after a server failure, count it, and tell the check how long the start has taken", async () => {
    const sent: { step: string; waitedMs?: number; retries?: number }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push({ step: body.step, waitedMs: body.waitedMs, retries: body.retries });
      if (body.step === "generate" && sent.filter((s) => s.step === "generate").length === 1) {
        return new Response("<html>502 Bad Gateway</html>", { status: 502 });
      }
      if (body.step === "generate") return Response.json({ session: written });
      if (body.step === "review") return Response.json({ session: ready });
      return Response.json({ error: `Unexpected step ${body.step}` }, { status: 400 });
    });

    const store = drivenStore(analysed, Date.now() - 5000);
    await settle();

    expect(sent.map((s) => s.step)).toEqual(["generate", "generate", "review"]);
    expect(store.readEnvelope()!.startupRetries).toBe(1);
    const review = sent.find((s) => s.step === "review")!;
    expect(review.retries).toBe(1);
    expect(review.waitedMs).toBeGreaterThanOrEqual(5000);
    // The questions are ready and question 1 is asked.
    expect(nextStep(store.readEnvelope()!.session!)).toMatchObject({ step: "answer", kind: "main" });
  });

  it("fail a stage at once, in the API's words, when a second go would not help", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => (calls++, Response.json({ error: "You have reached today's limit." }, { status: 422 })));

    const store = drivenStore(analysed);
    await settle();

    expect(calls).toBe(1);
    expect(store.getJobsSnapshot()["1:generate"]).toEqual({ status: "failed", message: "You have reached today's limit." });
    expect(store.readEnvelope()!.startupRetries).toBeUndefined();
  });

  it("fail a stage when its second go fails too; Try again then carries on from that stage, with what is done kept", async () => {
    const steps: string[] = [];
    let broken = true;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const { step } = JSON.parse(String(init.body));
      steps.push(step);
      if (broken) return new Response("Service Unavailable", { status: 503 });
      return Response.json({ session: step === "generate" ? written : ready });
    });

    const store = drivenStore(analysed);
    await settle();
    expect(steps).toEqual(["generate", "generate"]);
    expect(store.getJobsSnapshot()["1:generate"]).toEqual({ status: "failed", message: stepProblems.server });

    broken = false;
    retryStartupStage(store, "1", "1:generate");
    await settle();
    // Stage 1 is not run again: Try again starts from the stage that failed.
    expect(steps).toEqual(["generate", "generate", "generate", "review"]);
    expect(store.readEnvelope()!.startupRetries).toBe(2);
    expect(nextStep(store.readEnvelope()!.session!)).toMatchObject({ step: "answer" });
  });
});

describe("drive after 'End here'", () => {
  it("records the end once, even while a suggested answer has failed and waits for Try again", async () => {
    const steps: string[] = [];
    // No localStorage here, so the store keeps the session in memory.
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const { step } = JSON.parse(String(init.body));
      steps.push(step);
      if (step === "end") return Response.json({ ended: true });
      return Response.json({ error: "We could not write this suggested answer." }, { status: 502 });
    });

    const store = createPracticeStore("interview-practice:test", "/interview/api");
    store.writeEnvelope({ sourceId: "job-1", inputs: null, session: endedSessionFor(fixture), startedAtMs: 1, startupMs: null });
    // Like the page's effect: every change to the session or the jobs runs drive again, after the render.
    store.subscribe(() =>
      setTimeout(() => {
        const envelope = store.readEnvelope();
        if (envelope) drive(store, envelope, { jobId: "job-1" });
      }),
    );
    drive(store, store.readEnvelope()!, { jobId: "job-1" });
    await settle();

    expect(steps.filter((step) => step === "end")).toHaveLength(1);
    expect(steps.filter((step) => step === "suggest")).toHaveLength(6);
  });
});
