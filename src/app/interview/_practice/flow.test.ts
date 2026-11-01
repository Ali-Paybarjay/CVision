// drive() after "End here" (#205), with the real store: the page calls drive again after every change.
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataAnalystSara as fixture } from "@/features/interview/fixtures/data-analyst-sara";
import { endedSessionFor } from "@/features/interview/test-support";
import { drive } from "./flow";
import { createPracticeStore } from "./store";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Lets every pending request and re-drive settle. */
async function settle() {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

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
