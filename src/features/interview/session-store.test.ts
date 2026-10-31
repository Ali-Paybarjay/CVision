import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewSession } from "./contracts";
import { addAnswer, applyEvaluation, applyFollowUpDecision, applySuggestion, askQuestion, endEarly, endedOverall, missingSuggestionIds, reportQuestionIds } from "./engine/session";
import { evaluateAnswer, suggestAnswer } from "./engine/stages";
import { fixtures } from "./fixtures";
import { dataAnalystSara } from "./fixtures/data-analyst-sara";
import { listPracticeResults, listPracticeSummaries, loadLatestReport } from "./server/session-store";
import { endedSessionFor, inputsFor, readySessionFor, runMockSession } from "./test-support";

// A fake of the few query calls the store makes: it records the filters and answers with `rows.value`.
const rows = vi.hoisted(() => ({ value: [] as Record<string, unknown>[] | null, error: null as { code: string } | null }));
const calls = vi.hoisted(() => [] as unknown[][]);
const connected = vi.hoisted(() => ({ value: true }));
vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (!connected.value) return null;
    const query = {
      select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      not: (...args: unknown[]) => (calls.push(["not", ...args]), query),
      order: (...args: unknown[]) => (calls.push(["order", ...args]), query),
      limit: () => query,
      maybeSingle: async () => ({ data: rows.value?.[0] ?? null, error: rows.error }),
      then: (resolve: (result: unknown) => unknown) => resolve({ data: rows.value, error: rows.error }),
    };
    return { from: () => query };
  },
}));

const jobId = "6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f";
const otherJobId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

afterEach(() => {
  rows.value = [];
  rows.error = null;
  calls.length = 0;
  connected.value = true;
});

describe("loading a job's last report (#206)", () => {
  it("asks only for sessions with a report and returns the session with its date", async () => {
    const session = await runMockSession(fixtures[0]);
    rows.value = [{ data: session, updated_at: "2026-10-26T18:00:00+00:00" }];

    expect(await loadLatestReport(jobId)).toEqual({ session, practisedAt: "2026-10-26T18:00:00+00:00" });
    expect(calls).toContainEqual(["eq", "job_id", jobId]);
    expect(calls).toContainEqual(["not", "data->report", "is", null]);
    expect(calls).toContainEqual(["not", "data->endedAt", "is", null]);
  });

  it("is null for a sample job, without Supabase, on an error, or for a row without a valid report", async () => {
    const session = await runMockSession(fixtures[0]);
    expect(await loadLatestReport("sara-job-1")).toBeNull();

    rows.value = [{ data: { ...session, report: undefined }, updated_at: "2026-10-26T18:00:00+00:00" }];
    expect(await loadLatestReport(jobId)).toBeNull();

    rows.value = [{ data: { id: "broken" }, updated_at: "2026-10-26T18:00:00+00:00" }];
    expect(await loadLatestReport(jobId)).toBeNull();

    rows.error = { code: "PGRST000" };
    expect(await loadLatestReport(jobId)).toBeNull();

    connected.value = false;
    expect(await loadLatestReport(jobId)).toBeNull();
  });
});

describe("listing the latest practice of each job (#206)", () => {
  it("keeps the newest finished practice per job and reads only the job, date and score", async () => {
    rows.value = [
      { job_id: jobId, updated_at: "2026-10-28T10:00:00+00:00", overall: 3.4 },
      { job_id: otherJobId, updated_at: "2026-10-27T10:00:00+00:00", overall: 4 },
      { job_id: jobId, updated_at: "2026-10-26T10:00:00+00:00", overall: 2.1 },
      { job_id: "bad", updated_at: "2026-10-25T10:00:00+00:00", overall: "high" },
    ];

    expect(await listPracticeSummaries()).toEqual([
      { jobId, practisedAt: "2026-10-28T10:00:00+00:00", overall: 3.4 },
      { jobId: otherJobId, practisedAt: "2026-10-27T10:00:00+00:00", overall: 4 },
    ]);
    expect(calls).toContainEqual(["select", "job_id, updated_at, overall:data->report->overall"]);
    expect(calls).toContainEqual(["order", "updated_at", { ascending: false }]);
  });

  it("is empty without Supabase or on an error", async () => {
    rows.error = { code: "PGRST000" };
    expect(await listPracticeSummaries()).toEqual([]);
    connected.value = false;
    expect(await listPracticeSummaries()).toEqual([]);
  });
});

/** Sara's practice ended with "End here" after answering `answered`, with its scores and suggested answers written (mock). */
async function endedPractice(answered: string[]): Promise<InterviewSession> {
  const at = "2026-10-21T09:00:00.000Z";
  let session = readySessionFor(dataAnalystSara);
  for (const id of answered) {
    session = askQuestion(session, id, at, `${id}-asked`);
    session = addAnswer(session, { questionId: id, kind: "main", text: dataAnalystSara.answers[id].main, startedAt: at, submittedAt: at, id: `${id}-answer` });
    session = applyFollowUpDecision(session, { questionId: id, askFollowUp: false, gapType: "none", usedFallback: false, reason: "Moving on." }, at, `${id}-decided`);
  }
  session = endEarly(session, at);
  for (const id of reportQuestionIds(session)) session = applyEvaluation(session, (await evaluateAnswer(session, id)).evaluation);
  for (const id of missingSuggestionIds(session)) session = applySuggestion(session, (await suggestAnswer(session, id, inputsFor(dataAnalystSara))).suggestion);
  return session;
}

describe("a practice ended with 'End here' (#205)", () => {
  it("is the last practice once its scores and suggested answers are written, even with no answer", async () => {
    const report = await runMockSession(dataAnalystSara);
    const ended = await endedPractice([]);
    rows.value = [
      { data: ended, updated_at: "2026-10-28T10:00:00+00:00" },
      { data: report, updated_at: "2026-10-26T10:00:00+00:00" },
    ];
    expect(await loadLatestReport(jobId)).toEqual({ session: ended, practisedAt: "2026-10-28T10:00:00+00:00" });

    // Still writing its suggested answers: the older report stays the last practice.
    rows.value = [
      { data: endedSessionFor(dataAnalystSara), updated_at: "2026-10-29T10:00:00+00:00" },
      { data: report, updated_at: "2026-10-26T10:00:00+00:00" },
    ];
    expect(await loadLatestReport(jobId)).toEqual({ session: report, practisedAt: "2026-10-26T10:00:00+00:00" });
  });

  it("is listed with the average of its answered questions, or with no score when none was answered", async () => {
    const one = await endedPractice(["q1"]);
    rows.value = [
      { job_id: "unfinished", updated_at: "2026-10-29T10:00:00+00:00", data: endedSessionFor(dataAnalystSara) },
      { job_id: jobId, updated_at: "2026-10-28T10:00:00+00:00", data: await endedPractice([]) },
      { job_id: otherJobId, updated_at: "2026-10-27T10:00:00+00:00", data: one },
      { job_id: jobId, updated_at: "2026-10-26T10:00:00+00:00", overall: 3.4 },
    ];

    expect(endedOverall(one)).not.toBeNull();
    expect(await listPracticeResults()).toEqual([
      { jobId, practisedAt: "2026-10-28T10:00:00+00:00", overall: null },
      { jobId: otherJobId, practisedAt: "2026-10-27T10:00:00+00:00", overall: endedOverall(one) },
    ]);
    expect(calls).toContainEqual(["select", "job_id, updated_at, data"]);
    // The dashboard gets scores only: no entry for the job whose latest practice has none, rather than its older 3.4.
    expect(await listPracticeSummaries()).toEqual([{ jobId: otherJobId, practisedAt: "2026-10-27T10:00:00+00:00", overall: endedOverall(one) }]);
  });
});
