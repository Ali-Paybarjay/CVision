import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gapQuestionsKey, keptGapQuestions } from "@/features/tailor/server/gap-questions-store";
import { gapQuestionsPrompt, skillGaps, strongerGaps } from "@/features/tailor";
import type { GapQuestion } from "@/features/tailor/types";
import { personas } from "@/shared/sample-data";

const jobId = "0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10";
const { profile, match } = personas.sara;
const job = { ...personas.sara.jobs[0], id: jobId };
const input = { profile, job, match: { ...match, jobId }, userId: "user-1" };

const { db, user } = vi.hoisted(() => ({
  db: { row: null as unknown, upsert: vi.fn(), readError: null as unknown, writeError: null as unknown },
  user: { current: { id: "user-1", email: null } as unknown },
}));

vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => user.current }));
vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: db.readError }) }) }),
      upsert: async (row: { data: unknown }, options: unknown) => {
        db.upsert(row, options);
        if (!db.writeError) db.row = { data: row.data };
        return { error: db.writeError };
      },
    }),
  }),
}));

const questions: GapQuestion[] = [{ gapId: match.gaps[0].id, question: "Have you explained your dashboards to managers?" }];

beforeEach(() => {
  vi.clearAllMocks();
  db.row = null;
  db.readError = null;
  db.writeError = null;
  user.current = { id: "user-1", email: null };
});

describe("gap questions asked once per job (#304)", () => {
  it("asks the model the first time, keeps the questions, and reads them back after that", async () => {
    const ask = vi.fn(async () => questions);

    expect(await keptGapQuestions(input, ask)).toEqual(questions);
    expect(await keptGapQuestions(input, ask)).toEqual(questions);
    expect(await keptGapQuestions(input, ask)).toEqual(questions);

    expect(ask).toHaveBeenCalledTimes(1);
    const [row, options] = db.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "job_id,user_id" });
    expect(row).toEqual({ job_id: jobId, data: { key: await gapQuestionsKey(input), questions } });
  });

  it("shares one request between renders that start at the same moment", async () => {
    let finish!: (value: GapQuestion[]) => void;
    const ask = vi.fn(() => new Promise<GapQuestion[]>((resolve) => (finish = resolve)));

    const renders = [keptGapQuestions(input, ask), keptGapQuestions(input, ask), keptGapQuestions(input, ask)];
    await vi.waitFor(() => expect(ask).toHaveBeenCalled());
    finish(questions);

    expect(await Promise.all(renders)).toEqual([questions, questions, questions]);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks again when the Profile or the gaps change", async () => {
    const ask = vi.fn(async () => questions);
    await keptGapQuestions(input, ask);

    await keptGapQuestions({ ...input, profile: { ...profile, skills: [...profile.skills, "Power BI"] } }, ask);
    await keptGapQuestions({ ...input, match: { ...input.match, gaps: input.match.gaps.slice(1) } }, ask);

    expect(ask).toHaveBeenCalledTimes(3);
  });

  it("asks again when the strengths change, since they can become questions too", async () => {
    const ask = vi.fn(async () => questions);
    await keptGapQuestions(input, ask);
    await keptGapQuestions({ ...input, match: { ...input.match, strengths: input.match.strengths.slice(1) } }, ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("gives the same key whatever the Profile's id, so a re-saved Profile keeps its questions", async () => {
    expect(await gapQuestionsKey({ ...input, profile: { ...profile, id: "another-id" } })).toBe(await gapQuestionsKey(input));
  });

  it("keys the questions on the request text the model gets, so a new prompt gives a new key (#416)", async () => {
    const prompt = await gapQuestionsPrompt({ profile, job, gaps: skillGaps(match.gaps), stronger: strongerGaps(job, match, profile) });
    expect(await gapQuestionsKey(input)).toBe(createHash("sha256").update(prompt).digest("hex"));
  });

  it("asks again for a job whose questions were kept under the old key, before the prompt counted (#416)", async () => {
    const oldSource = {
      profile: { ...profile, id: undefined },
      job: { title: job.title, company: job.company, description: job.description, requirements: job.requirements },
      gaps: skillGaps(input.match.gaps),
    };
    const oldKey = createHash("sha256").update(JSON.stringify(oldSource)).digest("hex");
    db.row = { data: { key: oldKey, questions: [{ gapId: match.gaps[0].id, question: "An old, general question?" }] } };
    const ask = vi.fn(async () => questions);

    expect(await keptGapQuestions(input, ask)).toEqual(questions);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing when the model fails, so the next render asks again", async () => {
    const ask = vi.fn(async (): Promise<GapQuestion[]> => {
      throw new Error("limit");
    });

    await expect(keptGapQuestions(input, ask)).rejects.toThrow("limit");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("keeps nothing for a sample job or a signed-out visitor, and still returns the questions", async () => {
    const ask = vi.fn(async () => questions);

    expect(await keptGapQuestions({ ...input, job: { ...job, id: "sara-job-1" } }, ask)).toEqual(questions);
    user.current = null;
    expect(await keptGapQuestions({ ...input, userId: undefined }, ask)).toEqual(questions);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("still opens the page when the database fails, by asking the model", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    db.readError = { code: "57014" };
    db.writeError = { code: "42501" };
    const ask = vi.fn(async () => questions);

    expect(await keptGapQuestions(input, ask)).toEqual(questions);
    expect(consoleError).toHaveBeenCalledWith("tailor: could not read the gap questions (57014)");
    expect(consoleError).toHaveBeenCalledWith("tailor: could not keep the gap questions (42501)");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("dashboards");
  });

  it("ignores a stored row that does not match its shape", async () => {
    db.row = { data: { key: await gapQuestionsKey(input), questions: [{ gapId: "x" }] } };
    const ask = vi.fn(async () => questions);

    expect(await keptGapQuestions(input, ask)).toEqual(questions);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
