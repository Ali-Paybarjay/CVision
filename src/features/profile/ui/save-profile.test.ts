import { afterEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { cvFileMessages } from "../cv-limits";
import { saveFields } from "../server/save-request";
import { saveProfileToAccount } from "./save-profile";

vi.mock("next/server", () => ({ after: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveProfileToAccount", () => {
  it("posts the fields the server reads", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, savedAt: "2026-10-21T12:00:00.000Z", cvFormat: "pdf" }));
    vi.stubGlobal("fetch", fetch);
    const cv = new File(["%PDF"], "cv.pdf");

    const result = await saveProfileToAccount(personas.sara.profile, { reason: "approved", cv, consentVersion: "v1" });

    expect(result.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as FormData;
    expect(url).toBe("/profile/save");
    expect(JSON.parse(String(body.get(saveFields.profile)))).toEqual(personas.sara.profile);
    expect(body.get(saveFields.reason)).toBe("approved");
    expect(body.get(saveFields.consent)).toBe("v1");
    expect(body.get(saveFields.cv)).toBeInstanceOf(File);
  });

  it("turns a network failure into a message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));

    expect(await saveProfileToAccount(personas.sara.profile, { reason: "preferences" })).toMatchObject({
      ok: false,
      code: "failed",
      message: "We couldn’t reach CVision. Check your connection and try again.",
    });
  });

  it("passes on the server's own answer", async () => {
    const own = { ok: false, code: "sign-in", message: "Sign in to save your profile." };
    answer(JSON.stringify(own), 401, "application/json");

    expect(await saveProfileToAccount(personas.sara.profile, { reason: "approved" })).toEqual(own);
  });

  it("says when saving ran out of time", async () => {
    answer("An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT", 504);

    expect(await saveProfileToAccount(personas.sara.profile, { reason: "approved" })).toEqual({
      ok: false,
      code: "failed",
      message: "Saving your profile took too long. Try again in a minute.",
    });
  });

  it("says when the file was too big for the host", async () => {
    answer("Request Entity Too Large", 413);

    expect(await saveProfileToAccount(personas.sara.profile, { reason: "approved" })).toEqual({
      ok: false,
      code: "file",
      message: cvFileMessages.tooLarge,
    });
  });

  it("says something went wrong on our side for any other answer that isn't ours", async () => {
    answer("<html><body>Internal Server Error</body></html>", 500, "text/html");

    expect(await saveProfileToAccount(personas.sara.profile, { reason: "approved" })).toEqual({
      ok: false,
      code: "failed",
      message: "Something went wrong on our side. Try again in a minute.",
    });
  });
});

function answer(body: string, status: number, contentType = "text/plain") {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "Content-Type": contentType } })));
}
