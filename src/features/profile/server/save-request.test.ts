import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { cvConsent, manualConsent } from "../consent";
import { MAX_CV_BYTES } from "../cv-limits";
import { handleSaveRequest, saveFields } from "./save-request";
import { saveAccountProfile } from "./profile-account";
import type { SupabaseServerClient } from "./job-store";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => void callback() }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("./profile-account", () => ({
  saveAccountProfile: vi.fn(async () => ({ ok: true, savedAt: "2026-10-21T12:00:00.000Z", cvFormat: "docx" })),
}));

const supabase = {} as SupabaseServerClient;
const account = { supabase, userId: "user-1" };
const profile = personas.reza.profile;
const docx = () => new File([readFileSync(join(process.cwd(), "sample-data", "cvs", "reza.docx"))], "reza.docx");

function form(fields: { profile?: unknown; cv?: File; consent?: string; reason?: string }): FormData {
  const data = new FormData();
  if (fields.profile !== undefined) data.set(saveFields.profile, typeof fields.profile === "string" ? fields.profile : JSON.stringify(fields.profile));
  if (fields.cv) data.set(saveFields.cv, fields.cv);
  if (fields.consent) data.set(saveFields.consent, fields.consent);
  if (fields.reason) data.set(saveFields.reason, fields.reason);
  return data;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleSaveRequest", () => {
  it("saves an approved profile with its CV file, and records the approval without the CV", async () => {
    const result = await handleSaveRequest(form({ profile, cv: docx(), consent: cvConsent.version }), account);

    expect(result).toEqual({ ok: true, savedAt: "2026-10-21T12:00:00.000Z", cvFormat: "docx" });
    const [, userId, saved, cv] = vi.mocked(saveAccountProfile).mock.calls[0];
    expect([userId, saved, cv?.format]).toEqual(["user-1", profile, "docx"]);
    expect(track).toHaveBeenCalledWith(
      "profile.approved",
      { newCv: true, manual: false, consentVersion: cvConsent.version, jobs: 2, skills: profile.skills.length, answers: 0 },
      { userId: "user-1" },
    );
    expect(JSON.stringify(track.mock.calls)).not.toContain(profile.fullName);
  });

  it("saves a profile typed in by hand with the consent given for it, and records it as one", async () => {
    const result = await handleSaveRequest(form({ profile, consent: manualConsent.version }), account);

    expect(result).toEqual({ ok: true, savedAt: "2026-10-21T12:00:00.000Z", cvFormat: "docx" });
    const [, userId, saved, cv] = vi.mocked(saveAccountProfile).mock.calls[0];
    expect([userId, saved, cv]).toEqual(["user-1", profile, undefined]);
    expect(track).toHaveBeenCalledWith(
      "profile.approved",
      { newCv: false, manual: true, consentVersion: manualConsent.version, jobs: 2, skills: profile.skills.length, answers: 0 },
      { userId: "user-1" },
    );
    expect(JSON.stringify(track.mock.calls)).not.toContain(profile.fullName);
  });

  it("records an edit of the saved profile with no new consent", async () => {
    await handleSaveRequest(form({ profile }), account);

    expect(track).toHaveBeenCalledWith(
      "profile.approved",
      expect.objectContaining({ newCv: false, manual: false, consentVersion: null }),
      { userId: "user-1" },
    );
  });

  it("refuses any other consent without a CV file, and the typed-in profile's consent with one", async () => {
    expect(await handleSaveRequest(form({ profile, consent: cvConsent.version }), account)).toMatchObject({
      ok: false,
      code: "consent",
    });
    expect(await handleSaveRequest(form({ profile, cv: docx(), consent: manualConsent.version }), account)).toMatchObject({
      ok: false,
      code: "consent",
    });
    expect(saveAccountProfile).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("saves new preferences without a file, and records only approvals", async () => {
    await handleSaveRequest(form({ profile, reason: "preferences" }), account);

    expect(vi.mocked(saveAccountProfile).mock.calls.map((call) => call[3])).toEqual([undefined]);
    expect(track).not.toHaveBeenCalled();
  });

  it("keeps a CV file only with the consent given for it", async () => {
    const result = await handleSaveRequest(form({ profile, cv: docx(), consent: "2026-01-01" }), account);

    expect(result).toMatchObject({ ok: false, code: "consent" });
    expect(saveAccountProfile).not.toHaveBeenCalled();
  });

  it("checks the file's contents, not its name", async () => {
    const fake = new File(["just text, not a CV"], "cv.pdf");

    expect(await handleSaveRequest(form({ profile, cv: fake, consent: cvConsent.version }), account)).toMatchObject({
      ok: false,
      code: "file",
    });
    const huge = new File([new Uint8Array(MAX_CV_BYTES + 1)], "cv.pdf");
    expect(await handleSaveRequest(form({ profile, cv: huge, consent: cvConsent.version }), account)).toMatchObject({
      ok: false,
      code: "file",
    });
    expect(saveAccountProfile).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a profile", async () => {
    for (const bad of ["not json", { fullName: "Only a name" }, undefined]) {
      expect(await handleSaveRequest(form({ profile: bad }), account)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(saveAccountProfile).not.toHaveBeenCalled();
  });

  it("says so when the account couldn't save it", async () => {
    vi.mocked(saveAccountProfile).mockResolvedValueOnce({ ok: false });

    expect(await handleSaveRequest(form({ profile }), account)).toMatchObject({ ok: false, code: "failed" });
  });
});
