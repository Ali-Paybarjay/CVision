import { afterEach, describe, expect, it, vi } from "vitest";
import type { CvCheckResult } from "@/shared/contracts";
import { handleCvCheckRequest } from "./check-request";

// Whether a signed-in user has a profile decides where the result's Tailor button leads (#548): on to a job ad, or to
// Profile to build one. The check itself is tested in check-cv.test.ts and the route test.

const result: CvCheckResult = { readiness: "nearly-ready", score: 70, summary: "Nearly ready.", issues: [] };
const { checkCv } = vi.hoisted(() => ({ checkCv: vi.fn() }));
vi.mock("./check-cv", () => ({ checkCv }));
checkCv.mockResolvedValue(result);

const { getMyProfile } = vi.hoisted(() => ({ getMyProfile: vi.fn() }));
vi.mock("@/features/profile/my-data", () => ({ getMyProfile }));

/** A fictional CV, pasted, long enough to be checked. */
function pasted(): FormData {
  const form = new FormData();
  form.set("cvText", `Alex Morgan, Leeds.\n${"Customer service adviser who answered bills and meter reading calls. ".repeat(4)}`);
  return form;
}

afterEach(() => {
  getMyProfile.mockReset();
  checkCv.mockReset();
  checkCv.mockResolvedValue(result);
});

describe("handleCvCheckRequest and the user's profile (#548)", () => {
  it("says whether a signed-in user has a saved profile", async () => {
    getMyProfile.mockResolvedValue({ fullName: "Alex Morgan" });
    expect(await handleCvCheckRequest(pasted(), { requester: { userId: "user-1" } })).toMatchObject({ ok: true, hasProfile: true });

    getMyProfile.mockResolvedValue(null);
    expect(await handleCvCheckRequest(pasted(), { requester: { userId: "user-1" } })).toMatchObject({ ok: true, hasProfile: false });
  });

  it("counts a profile that can't be read as none, so the button still leads to Profile", async () => {
    getMyProfile.mockRejectedValue(new Error("database down"));
    expect(await handleCvCheckRequest(pasted(), { requester: { userId: "user-1" } })).toMatchObject({ ok: true, hasProfile: false });
  });

  it("doesn't look for a visitor's profile, or tell their browser anything about one", async () => {
    const response = await handleCvCheckRequest(pasted(), { requester: { anonymousKey: "visitor-key-1" } });

    expect(response).toMatchObject({ ok: true, result });
    expect(response).not.toHaveProperty("hasProfile");
    expect(getMyProfile).not.toHaveBeenCalled();
  });

  it("still answers with the check's own failure when the check fails", async () => {
    getMyProfile.mockResolvedValue({ fullName: "Alex Morgan" });
    checkCv.mockRejectedValue(new Error("model down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleCvCheckRequest(pasted(), { requester: { userId: "user-1" } });
    quiet.mockRestore();
    expect(response).toMatchObject({ ok: false, code: "ai-unavailable" });
    expect(response).not.toHaveProperty("hasProfile");
  });
});
