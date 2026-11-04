import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMyTailoredCv, saveTailoredCv } from "@/features/tailor/server/tailored-cvs";
import { TailoredCvSchema, type TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const jobId = "0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10";
const { profile } = personas.sara;

const { db, savedChanges, user } = vi.hoisted(() => ({
  db: { row: null as unknown, upsert: vi.fn(), error: null as unknown },
  savedChanges: { list: [] as unknown[] },
  user: { current: { id: "user-1", email: null } as unknown },
}));

vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => user.current }));
vi.mock("@/features/tailor/server/my-data", () => ({ getMyProfile: vi.fn(async () => profile) }));
vi.mock("@/features/tailor/server/saved-changes", () => ({ getMySavedChanges: async () => savedChanges.list }));
vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }),
      upsert: async (...args: unknown[]) => (db.upsert(...args), { error: db.error }),
    }),
  }),
}));

const change = (id: string, status: TailoringChange["status"]): TailoringChange => ({
  id,
  jobId,
  section: "skills",
  before: null,
  after: `Skill ${id}`,
  evidence: "From the CV.",
  evidenceSource: "cv",
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.row = null;
  db.error = null;
  user.current = { id: "user-1", email: null };
  savedChanges.list = [change("a", "approved"), change("b", "rejected"), change("c", "proposed")];
});

describe("saving what the user sends (#207)", () => {
  it("saves the approved changes from the database, applied to the Profile, with the letter", async () => {
    expect(await saveTailoredCv(jobId, "Dear hiring manager,")).toBe(true);
    const [row, options] = db.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "job_id,user_id" });
    expect(row.job_id).toBe(jobId);
    const data = TailoredCvSchema.parse(row.data);
    expect(data.changes.map((item) => item.id)).toEqual(["a"]);
    expect(data.cv.skills).toContain("Skill a");
    expect(data.cv.skills).not.toContain("Skill b");
    expect(data.coverLetter).toBe("Dear hiring manager,");
  });

  it("keeps the saved row's id when it saves again, and stores no letter as null", async () => {
    db.row = { data: { id: "kept-id", jobId, cv: profile, changes: [], coverLetter: "Old", savedAt: "2026-11-01T09:00:00.000Z" } };
    await saveTailoredCv(jobId, "  ");
    const data = TailoredCvSchema.parse(db.upsert.mock.calls[0][0].data);
    expect(data.id).toBe("kept-id");
    expect(data.coverLetter).toBeNull();
  });

  it("saves nothing for a sample job or a signed-out visitor", async () => {
    expect(await saveTailoredCv("sara-job-1", null)).toBe(false);
    user.current = null;
    expect(await saveTailoredCv(jobId, null)).toBe(false);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("reports a failed save without throwing, so the download still goes ahead", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.error = { code: "42501" };
    expect(await saveTailoredCv(jobId, null)).toBe(false);
  });
});

describe("reading it back", () => {
  it("returns the saved CV for this job only", async () => {
    db.row = { data: { id: "s", jobId, cv: profile, changes: [], coverLetter: null, savedAt: "2026-11-01T09:00:00.000Z" } };
    expect((await getMyTailoredCv(jobId))?.id).toBe("s");
    db.row = { data: { id: "s", jobId: "another-job", cv: profile, changes: [], coverLetter: null, savedAt: "2026-11-01T09:00:00.000Z" } };
    expect(await getMyTailoredCv(jobId)).toBeNull();
  });

  it("returns null when nothing is saved or the row does not match the contract", async () => {
    expect(await getMyTailoredCv(jobId)).toBeNull();
    db.row = { data: { id: "s" } };
    expect(await getMyTailoredCv(jobId)).toBeNull();
  });
});

describe("a save that breaks", () => {
  it("never throws, so Download and Apply still work", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getMyProfile } = await import("@/features/tailor/server/my-data");
    vi.mocked(getMyProfile).mockRejectedValueOnce(new Error("down"));
    await expect(saveTailoredCv(jobId, null)).resolves.toBe(false);
  });
});
