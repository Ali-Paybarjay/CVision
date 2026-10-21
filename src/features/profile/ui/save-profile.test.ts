import { afterEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
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

    expect(await saveProfileToAccount(personas.sara.profile, { reason: "answers" })).toMatchObject({ ok: false, code: "failed" });
  });
});
