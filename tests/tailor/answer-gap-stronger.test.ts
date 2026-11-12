import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap, createCoverLetter } from "@/features/tailor/actions";
import { defaultGapQuestion, strongerGaps } from "@/features/tailor/gap-questions";
import type * as Propose from "@/features/tailor/propose-changes";
import type { TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const { propose, writeCoverLetter } = vi.hoisted(() => ({ propose: vi.fn(), writeCoverLetter: vi.fn() }));
vi.mock("@/features/tailor/cover-letter", async (original) => ({ ...(await original<typeof import("@/features/tailor/cover-letter")>()), writeCoverLetter }));
vi.mock("@/features/tailor/propose-changes", async (importOriginal) => {
  const real = await importOriginal<typeof Propose>();
  return {
    ...real,
    // A test can give the result itself with propose.mockResolvedValueOnce; otherwise the real stage runs.
    proposeChanges: (input: Propose.ProposeInput) => propose(input) ?? real.proposeChanges(input),
  };
});
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const { profile, jobs, match: saraMatch } = personas.sara;
// Sara's match, plus a strength her older role shows, for the new line's role (#444).
const match = { ...saraMatch, strengths: [...saraMatch.strengths, { requirement: "Training new staff", evidence: "Trained four new starters" }] };
vi.mock("@/features/tailor/server/my-data", () => ({ getMyProfile: async () => profile, getMyJob: async () => jobs[0], getMyMatch: async () => match }));
const [sql, dashboards, training] = strongerGaps(jobs[0], match, profile);

beforeEach(() => vi.clearAllMocks());

describe("answerGap for a Make it stronger question", () => {
  it("finds the strength's gap, and sends a yes on to the suggestion like any unclear gap", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: sql.id, answer: "", hasExperience: true, chosen: "I wrote the SQL for the weekly sales report" });
    expect(result.ok).toBe(true);
    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose.mock.calls[0][0].match.gaps).toEqual([sql]);
  });

  it("takes a no as nothing more to add: no model call, no change, no next step", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: sql.id, answer: "", hasExperience: false });
    expect(result).toEqual({
      ok: true,
      answer: "Nothing more to add.",
      hasExperience: false,
      changes: [],
      nextSteps: [],
      hint: "No problem. Your CV keeps this line as it is.",
      removed: 0,
    });
    expect(propose).not.toHaveBeenCalled();
  });

  it("never passes that no on as not done, so it blocks no later change", async () => {
    const result = await answerGap({
      jobId: "sara-job-1",
      gapId: "sara-gap-1",
      answer:
        "Every Monday I walked the regional managers through the dashboard on a call and wrote a one-page summary in plain English with the three things that changed that week.",
      hasExperience: true,
      earlierAnswers: [{ gapId: sql.id, answer: "No", hasExperience: false }],
    });
    expect(result.ok && result.changes).toHaveLength(1);
    const { context } = propose.mock.calls[0][0];
    expect(context.answers.map((item: { gapId: string }) => item.gapId)).not.toContain(sql.id);
  });

  it("still keeps a yes to a strength among the earlier answers", async () => {
    await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-1", answer: "", hasExperience: true, earlierAnswers: [{ gapId: sql.id, answer: "I wrote it", hasExperience: true }] });
    expect(propose.mock.calls[0][0].context.answers).toEqual([expect.objectContaining({ gapId: sql.id, hasExperience: true })]);
  });
});

describe("answerGap reads the answer as a reply to the question the user saw (#444)", () => {
  const asked = () => propose.mock.calls[0][0].answers[0];

  it("sends that question on with a Make it stronger answer", async () => {
    const question = "How many people used the Tableau dashboards you built for the regional sales team?";
    await answerGap({ jobId: "sara-job-1", gapId: dashboards.id, answer: "", hasExperience: true, chosen: "About 15", typed: true, question });
    expect(asked()).toEqual({ gapId: dashboards.id, question, answer: "About 15", hasExperience: true });
  });

  it("sends a question that asks about two things with or, for a missing gap", async () => {
    const question = "Have you built dashboards in Power BI, or reports in Power Query?";
    await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, chosen: "I built reports in Power Query", question });
    expect(asked()).toMatchObject({ gapId: "sara-gap-2", question, answer: "I built reports in Power Query" });
  });

  it("without one, asks a strength's plain question, which never says the CV does not show it", async () => {
    await answerGap({ jobId: "sara-job-1", gapId: sql.id, answer: "", hasExperience: true, chosen: "I wrote the SQL" });
    expect(asked().question).toBe(defaultGapQuestion(sql).question);
    expect(asked().question).toContain("your CV shows it");
    expect(asked().question).not.toMatch(/does not show/);
  });

  it("never fails an answer over a question longer than 500 characters: it sends the plain question instead", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: sql.id, answer: "", hasExperience: true, chosen: "I wrote the SQL", question: "x".repeat(600) });
    expect(result.ok).toBe(true);
    expect(asked().question).toBe(defaultGapQuestion(sql).question);
  });

  it("gives no tip to add a number right after the user typed one", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: dashboards.id, answer: "", hasExperience: true, chosen: "About 15", typed: true });
    expect(result.ok && result.changes).toEqual([]);
    expect(result.ok && result.hint).toMatch(/optional/);
    expect(result.ok && result.hint).not.toMatch(/number/);
  });
});

describe("a new work line for a strength goes under that strength's role, or is not offered (#444)", () => {
  const line = (id: string, patch: Partial<TailoringChange> = {}): TailoringChange => ({
    id,
    jobId: "sara-job-1",
    gapId: training.id,
    section: "experience",
    before: null,
    after: "Trained about 15 new starters on the tills",
    evidence: "About 15",
    evidenceSource: "follow-up-answer",
    status: "proposed",
    ...patch,
  });
  const answer = () => answerGap({ jobId: "sara-job-1", gapId: training.id, answer: "", hasExperience: true, chosen: "About 15", typed: true });

  it("leaves out a new line whose answer names no role, as it would go under the most recent one", async () => {
    propose.mockResolvedValueOnce({ changes: [line("c1")], nextSteps: [], removed: [] });
    const result = await answer();
    expect(result.ok && result.changes).toEqual([]);
    expect(result.ok && result.removed).toBe(1);
  });

  it("keeps a rewrite of the strength's own line, and a new line whose answer names its role", async () => {
    const rewrite = line("c1", { before: "Trained four new starters", after: "Trained about 15 new starters", evidence: "Trained four new starters", evidenceSource: "cv" });
    const named = line("c2", { evidence: "At Greenway Foods I trained about 15 new starters" });
    propose.mockResolvedValueOnce({ changes: [rewrite, named], nextSteps: [], removed: [] });
    const result = await answer();
    expect(result.ok && result.changes.map((change) => change.id)).toEqual(["c1", "c2"]);
  });

  it("keeps a new line for a strength of the most recent role, where it goes anyway", async () => {
    propose.mockResolvedValueOnce({ changes: [line("c1", { gapId: dashboards.id })], nextSteps: [], removed: [] });
    const result = await answerGap({ jobId: "sara-job-1", gapId: dashboards.id, answer: "", hasExperience: true, chosen: "About 15", typed: true });
    expect(result.ok && result.changes.map((change) => change.id)).toEqual(["c1"]);
  });
});

describe("the cover letter and a Make it stronger answer", () => {
  const letter = { greeting: "Dear Hiring Manager,", paragraphs: ["I wrote SQL for weekly sales reports."], signOff: "Yours sincerely," };
  const powerBi = match.gaps.find((item) => item.requirement === "Power BI")!;

  it("leaves out a no to a strength, so the letter still names what the CV shows, and keeps a no to a real gap", async () => {
    writeCoverLetter.mockResolvedValue(letter);
    const answers = [
      { gapId: sql.id, question: "", answer: "Nothing more to add.", hasExperience: false },
      { gapId: powerBi.id, question: "", answer: "I haven't done this.", hasExperience: false },
    ];
    expect(await createCoverLetter({ jobId: "sara-job-1", changes: [], answers })).toMatchObject({ ok: true });
    expect(writeCoverLetter.mock.calls[0][0].answers.map((item: { gapId: string }) => item.gapId)).toEqual([powerBi.id]);
    expect(writeCoverLetter.mock.calls[0][0].declined).toEqual(["Power BI"]);
  });

  it("keeps a yes to a strength for the letter", async () => {
    writeCoverLetter.mockResolvedValue(letter);
    const answers = [{ gapId: sql.id, question: "", answer: "I wrote the SQL for the weekly sales report", hasExperience: true }];
    await createCoverLetter({ jobId: "sara-job-1", changes: [], answers });
    expect(writeCoverLetter.mock.calls[0][0].answers).toEqual(answers);
  });
});
