import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { handleSaveRequest } from "@/features/profile/server/save-request";
import { POST } from "./route";

const { getCurrentUser, createSupabaseServerClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/features/profile/server/save-request", () => ({
  handleSaveRequest: vi.fn(async () => ({ ok: true, savedAt: "2026-10-21T12:00:00.000Z", cvFormat: null })),
}));

function save(headers: Record<string, string> = {}): Request {
  const form = new FormData();
  form.set("profile", JSON.stringify(personas.sara.profile));
  return new Request("http://localhost:3000/profile/save", { method: "POST", body: form, headers });
}

beforeEach(() => {
  createSupabaseServerClient.mockResolvedValue({});
  getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /profile/save", () => {
  it("saves to the signed-in user's own account", async () => {
    const response = await POST(save());

    expect(response.status).toBe(200);
    expect(handleSaveRequest).toHaveBeenCalledWith(expect.any(FormData), { supabase: {}, userId: "user-1" });
  });

  it("asks a signed-out visitor to sign in, and saves nothing", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(save());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: "sign-in" });
    expect(handleSaveRequest).not.toHaveBeenCalled();
  });

  it("saves nothing when accounts are not switched on", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    expect((await POST(save())).status).toBe(401);
    expect(handleSaveRequest).not.toHaveBeenCalled();
  });

  it("refuses a save from another site", async () => {
    const response = await POST(save({ origin: "https://example.com" }));

    expect(response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
