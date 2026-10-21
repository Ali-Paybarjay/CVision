import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cvConsent } from "@/features/profile/consent";
import { handleExtractRequest } from "@/features/profile/server/extract-request";
import { POST } from "./route";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/features/profile/server/extract-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/profile/server/extract-request")>();
  return { ...actual, handleExtractRequest: vi.fn(actual.handleExtractRequest) };
});

function upload(fields: { consent?: string } = {}): Request {
  const form = new FormData();
  const cv = readFileSync(join(process.cwd(), "sample-data", "cvs", "sara.docx"));
  form.set("cv", new File([cv], "sara.docx"));
  if (fields.consent) form.set("consent", fields.consent);
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
    expect(await response.json()).toMatchObject({ ok: true, profile: { fullName: "Sara Khan" } });
  });

  it("refuses an upload from another site", async () => {
    const request = new Request(upload({ consent: cvConsent.version }), { headers: { origin: "https://example.com" } });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
