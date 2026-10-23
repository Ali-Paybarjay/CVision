import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userTables } from "@/features/account/data-rights";
import { fakeAdmin, readZip, type FakeData } from "@/features/account/test-support";
import { POST } from "./route";

const { getCurrentUser, getSupabaseAdmin, track, deferred } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  track: vi.fn(),
  deferred: [] as (() => unknown)[],
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/admin", () => ({ getSupabaseAdmin }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("next/server", () => ({ after: (work: () => unknown) => deferred.push(work) }));

const sara = "5d1c7a8e-2b3f-4c6d-9e0a-1b2c3d4e5f60";
const reza = "8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const url = "http://localhost:3000/dashboard/your-data/download";
const post = (headers: Record<string, string> = { origin: "http://localhost:3000" }) => POST(new Request(url, { method: "POST", headers }));

let data: FakeData;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  data = {
    tables: Object.fromEntries(userTables.map((table) => [table, [{ id: `${table}-1`, user_id: sara }, { id: `${table}-2`, user_id: reza }]])),
    files: new Map([
      [`${sara}/cv.pdf`, new TextEncoder().encode("%PDF sara")],
      [`${reza}/cv.pdf`, new TextEncoder().encode("%PDF reza")],
    ]),
  };
  getSupabaseAdmin.mockReturnValue(fakeAdmin(data).client);
  getCurrentUser.mockResolvedValue({ id: sara, email: "sara@example.com" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  deferred.length = 0;
});

describe("POST /dashboard/your-data/download", () => {
  it("downloads one ZIP of the signed-in user's data, never cached", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="cvision-data-\d{4}-\d{2}-\d{2}\.zip"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const files = readZip(new Uint8Array(await response.arrayBuffer()));
    expect(files.map((file) => file.name)).toEqual(["data.json", "cv-files/cv.pdf"]);
    const json = JSON.parse(new TextDecoder().decode(files[0].data));
    expect(Object.keys(json.tables)).toEqual([...userTables]);
    for (const table of userTables) expect(json.tables[table]).toEqual([{ id: `${table}-1`, user_id: sara }]);
  });

  it("records the download with counts only", async () => {
    await post();
    for (const work of deferred.splice(0)) await work();

    expect(track).toHaveBeenCalledWith("account.data_downloaded", { rows: 8, cvFiles: 1 }, { userId: sara });
  });

  it("sends a signed-out visitor to sign in", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/sign-in?next=/dashboard/your-data");
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("goes back to the page with a message when the download cannot be built", async () => {
    getSupabaseAdmin.mockReturnValue(fakeAdmin(data, { fail: ["read:events"] }).client);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard/your-data?download=failed");
    expect(deferred).toHaveLength(0);
  });

  it("goes back to the page while accounts are not switched on", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const response = await post();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard/your-data");
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("refuses a post from another site", async () => {
    const response = await post({ origin: "https://evil.example" });

    expect(response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
