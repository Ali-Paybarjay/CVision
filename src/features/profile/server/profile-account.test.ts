import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { deleteAccountProfile, loadAccountProfile, saveAccountProfile } from "./profile-account";
import type { SupabaseServerClient } from "./job-store";

const USER = "11111111-1111-4111-8111-111111111111";
const profile = personas.sara.profile;

type Row = { data: unknown; cv_file_path: string | null; updated_at: string };

/**
 * A stand-in for Supabase as one signed-in user: their profiles row (row-level security leaves at most one)
 * and the files in the cvs bucket. `fail` makes one kind of call return an error.
 */
function fakeSupabase(start: { row?: Row | null; files?: string[] } = {}, fail: "upload" | "upsert" | "remove" | "list" | "delete" | null = null) {
  let row: Row | null = start.row ?? null;
  const files = new Set(start.files ?? []);
  const uploads: Array<{ path: string; contentType: string }> = [];
  const error = (kind: typeof fail) => (fail === kind ? { message: `${kind} failed` } : null);

  const client = {
    from(table: string) {
      expect(table).toBe("profiles");
      return {
        select: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
        upsert: (values: { data: Profile; cv_file_path?: string }, options: { onConflict: string }) => {
          expect(options.onConflict).toBe("user_id");
          return {
            select: () => ({
              single: async () => {
                if (fail === "upsert") return { data: null, error: error("upsert") };
                row = {
                  data: values.data,
                  cv_file_path: values.cv_file_path ?? row?.cv_file_path ?? null,
                  updated_at: "2026-10-21T12:00:00+00:00",
                };
                return { data: row, error: null };
              },
            }),
          };
        },
        delete: () => ({
          eq: async (column: string, value: string) => {
            expect([column, value]).toEqual(["user_id", USER]);
            if (fail === "delete") return { error: error("delete") };
            row = null;
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from(bucket: string) {
        expect(bucket).toBe("cvs");
        return {
          upload: async (path: string, _bytes: Uint8Array, options: { contentType: string; upsert: boolean }) => {
            if (fail === "upload") return { data: null, error: error("upload") };
            uploads.push({ path, contentType: options.contentType });
            files.add(path);
            return { data: { path }, error: null };
          },
          remove: async (paths: string[]) => {
            if (fail === "remove") return { data: null, error: error("remove") };
            for (const path of paths) files.delete(path);
            return { data: [], error: null };
          },
          list: async (folder: string) => {
            if (fail === "list") return { data: null, error: error("list") };
            const names = [...files].filter((path) => path.startsWith(`${folder}/`)).map((path) => ({ name: path.slice(folder.length + 1) }));
            return { data: names, error: null };
          },
        };
      },
    },
  };
  return { client: client as unknown as SupabaseServerClient, files, uploads, row: () => row };
}

const pdf = { bytes: new TextEncoder().encode("%PDF-1.7"), format: "pdf" as const };

describe("loadAccountProfile", () => {
  it("reads the saved profile, when it was saved and the format of its CV file", async () => {
    const { client } = fakeSupabase({ row: { data: profile, cv_file_path: `${USER}/cv-1.docx`, updated_at: "2026-10-21T09:30:00+00:00" } });

    expect(await loadAccountProfile(client)).toEqual({ profile, savedAt: "2026-10-21T09:30:00.000Z", cvFormat: "docx" });
  });

  it("answers null when there is no profile yet, or the saved one is broken", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadAccountProfile(fakeSupabase().client)).toBeNull();
    const broken = fakeSupabase({ row: { data: { fullName: "" }, cv_file_path: null, updated_at: "2026-10-21T09:30:00Z" } });
    expect(await loadAccountProfile(broken.client)).toBeNull();
  });
});

describe("saveAccountProfile", () => {
  it("saves a new CV file in the user's own folder, then the profile pointing at it", async () => {
    const fake = fakeSupabase();

    const result = await saveAccountProfile(fake.client, USER, profile, pdf);

    expect(result).toEqual({ ok: true, savedAt: "2026-10-21T12:00:00.000Z", cvFormat: "pdf" });
    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0].path).toMatch(new RegExp(`^${USER}/cv-\\d+\\.pdf$`));
    expect(fake.uploads[0].contentType).toBe("application/pdf");
    expect(fake.row()).toMatchObject({ data: profile, cv_file_path: fake.uploads[0].path });
  });

  it("removes the old CV file only after the profile points at the new one", async () => {
    const old = `${USER}/cv-1.docx`;
    const fake = fakeSupabase({ row: { data: profile, cv_file_path: old, updated_at: "x" }, files: [old] });

    await saveAccountProfile(fake.client, USER, profile, pdf);

    expect([...fake.files]).toEqual([fake.uploads[0].path]);
  });

  it("keeps the CV file as it is when only the profile changes", async () => {
    const old = `${USER}/cv-1.docx`;
    const fake = fakeSupabase({ row: { data: profile, cv_file_path: old, updated_at: "x" }, files: [old] });
    const edited = { ...profile, summary: "A new summary." };

    const result = await saveAccountProfile(fake.client, USER, edited);

    expect(result).toMatchObject({ ok: true, cvFormat: "docx" });
    expect(fake.uploads).toEqual([]);
    expect(fake.row()).toMatchObject({ data: edited, cv_file_path: old });
    expect([...fake.files]).toEqual([old]);
  });

  it("saves nothing when the file can't be stored", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeSupabase({}, "upload");

    expect(await saveAccountProfile(fake.client, USER, profile, pdf)).toEqual({ ok: false });
    expect(fake.row()).toBeNull();
  });

  it("removes the new file again when the profile can't be saved, keeping the old one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const old = `${USER}/cv-1.docx`;
    const fake = fakeSupabase({ row: { data: profile, cv_file_path: old, updated_at: "x" }, files: [old] }, "upsert");

    expect(await saveAccountProfile(fake.client, USER, profile, pdf)).toEqual({ ok: false });
    expect([...fake.files]).toEqual([old]);
  });
});

describe("deleteAccountProfile", () => {
  it("deletes every CV file in the user's folder and the profile", async () => {
    const fake = fakeSupabase({
      row: { data: profile, cv_file_path: `${USER}/cv-2.pdf`, updated_at: "x" },
      files: [`${USER}/cv-1.docx`, `${USER}/cv-2.pdf`, "someone-else/cv-1.pdf"],
    });

    expect(await deleteAccountProfile(fake.client, USER)).toBe(true);
    expect([...fake.files]).toEqual(["someone-else/cv-1.pdf"]);
    expect(fake.row()).toBeNull();
  });

  it("keeps the profile when the files couldn't be deleted, so nothing is left without a record", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeSupabase({ row: { data: profile, cv_file_path: `${USER}/cv-1.pdf`, updated_at: "x" }, files: [`${USER}/cv-1.pdf`] }, "remove");

    expect(await deleteAccountProfile(fake.client, USER)).toBe(false);
    expect(fake.row()).not.toBeNull();
  });
});
