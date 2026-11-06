import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportDocument, exportSavedDocument } from "@/features/tailor/actions";
import { applyApprovedChanges } from "@/features/tailor/saved-cv";
import type { TailoredCv, TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const { profile, jobs } = personas.sara;
const job = jobs[0];

const { store } = vi.hoisted(() => ({ store: { saved: null as unknown, outcome: "saved" as string } }));
vi.mock("@/features/tailor/server/tailored-cvs", () => ({
  getMyTailoredCv: async () => store.saved,
  saveTailoredCv: vi.fn(async () => store.outcome),
}));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => ({ id: "user-1", email: null }) }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("@/features/tracker/actions", () => ({ recordApplication: vi.fn() }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const sent: TailoringChange = {
  id: "c1",
  jobId: job.id,
  section: "skills",
  before: null,
  after: "Line only in the sent CV",
  evidence: "From the CV.",
  evidenceSource: "cv",
  status: "approved",
};
const saved: TailoredCv = {
  id: "s1",
  jobId: job.id,
  cv: applyApprovedChanges(profile, [sent]),
  changes: [sent],
  coverLetter: "Dear hiring manager,\n\nThe letter I sent.",
  savedAt: "2026-11-03T10:00:00.000Z",
};

/** The text of a Word file, which is easy to read in a test. */
async function wordText(base64: string): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  return (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
}

beforeEach(() => {
  store.saved = saved;
  store.outcome = "saved";
});

describe("the file from the saved copy (#207)", () => {
  it("builds the CV from what was sent, not from today's Profile", async () => {
    const result = await exportSavedDocument({ jobId: job.id, document: "cv", format: "docx" });
    if (!result.ok) throw new Error(result.message);
    expect(await wordText(result.base64)).toContain("Line only in the sent CV");
  });

  it("dates the letter the day it was saved", async () => {
    const result = await exportSavedDocument({ jobId: job.id, document: "cover-letter", format: "docx" });
    if (!result.ok) throw new Error(result.message);
    const text = await wordText(result.base64);
    expect(text).toContain("The letter I sent.");
    expect(text).toContain("3 November 2026");
  });

  it("says so when nothing is saved, or no letter was sent", async () => {
    store.saved = { ...saved, coverLetter: null };
    expect(await exportSavedDocument({ jobId: job.id, document: "cover-letter", format: "pdf" })).toEqual({
      ok: false,
      message: "You had not approved a cover letter when you sent this CV.",
    });
    store.saved = null;
    expect((await exportSavedDocument({ jobId: job.id, document: "cv", format: "pdf" })).ok).toBe(false);
  });
});

describe("a download still works when the copy cannot be saved", () => {
  it("returns the file and flags only a real failure", async () => {
    const request = { jobId: job.id, document: "cv" as const, format: "docx" as const, changes: [], letter: null };
    store.outcome = "failed";
    const failed = await exportDocument(request);
    expect(failed.ok && failed.saveFailed).toBe(true);
    store.outcome = "skipped";
    const skipped = await exportDocument(request);
    expect(skipped.ok && skipped.saveFailed).toBe(false);
  });
});
