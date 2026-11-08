import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cvConsent } from "@/features/profile/consent";
import { handleExtractRequest } from "@/features/profile/server/extract-request";
import { POST } from "./route";

const { getCurrentUser, track } = vi.hoisted(() => ({ getCurrentUser: vi.fn(), track: vi.fn() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => void callback() }));
vi.mock("@/features/profile/server/extract-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/profile/server/extract-request")>();
  return { ...actual, handleExtractRequest: vi.fn(actual.handleExtractRequest) };
});

function upload(fields: { consent?: string; account?: string } = {}): Request {
  const form = new FormData();
  const cv = readFileSync(join(process.cwd(), "sample-data", "cvs", "sara.docx"));
  form.set("cv", new File([cv], "sara.docx"));
  if (fields.consent) form.set("consent", fields.consent);
  if (fields.account) form.set("account", fields.account);
  return new Request("http://localhost:3000/profile/extract", { method: "POST", body: form });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /profile/extract", () => {
  it("asks a signed-out visitor to sign in when the AI is live, before reading the upload", async () => {
    vi.stubEnv("AI_MODE", "live");
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(upload({ consent: cvConsent.version }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: "sign-in" });
    expect(handleExtractRequest).not.toHaveBeenCalled();
  });

  it("counts a signed-in user's upload against their own daily limit", async () => {
    vi.stubEnv("AI_MODE", "live");
    // Never reach the real model, even on a machine that has a key.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    // Without consent the upload stops before the model, but after the sign-in check.
    const response = await POST(upload());

    expect(response.status).toBe(400);
    expect(handleExtractRequest).toHaveBeenCalledWith(expect.any(FormData), { requester: { userId: "user-1" } });
  });

  it("keeps the demo open to signed-out visitors in mock mode", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(upload({ consent: cvConsent.version }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, extraction: { fullName: "Sara Khan" } });
  });

  it("records the upload without anything from the CV", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    await POST(upload({ consent: cvConsent.version }));

    expect(track).toHaveBeenCalledWith("profile.cv_uploaded", { format: "docx", truncated: false, demo: true }, { userId: "user-1" });
  });

  it("records nothing when the upload is refused", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    await POST(upload());

    expect(track).not.toHaveBeenCalled();
  });

  // A profile page left open while another account signed in, in another tab or after the session ended (#350).
  it("refuses an upload from a page built for another account, before reading it", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-2", email: null });

    const response = await POST(upload({ consent: cvConsent.version, account: "user-1" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "forbidden", message: expect.stringContaining("different account") });
    expect(handleExtractRequest).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("reads an upload from a page built for the account signed in now", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect((await POST(upload({ consent: cvConsent.version, account: "user-1" }))).status).toBe(200);
  });

  it("refuses an upload from another site", async () => {
    const request = new Request(upload({ consent: cvConsent.version }), { headers: { origin: "https://example.com" } });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
