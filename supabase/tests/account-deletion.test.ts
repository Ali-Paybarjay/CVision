import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userTables } from "@/features/account/user-tables";
import { asUser, createTestDatabase } from "./test-database";

// "Delete my account" deletes the user from auth.users and relies on on delete cascade for everything else
// (issue #43). userTables is the app's own list: the tables it counts, downloads and promises to empty.

const sara = randomUUID();
const reza = randomUUID();
let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query("insert into auth.users (id) values ($1), ($2)", [sara, reza]);
  await addEverything(sara);
  await addEverything(reza);
  // Usage from before signing in: keyed by the daily anonymous code, not linked to any account.
  await db.query("insert into public.events (name, anonymous_id) values ('home.cta_clicked', 'anon-key')");
  await db.query("insert into public.ai_usage (feature, model, ok, anonymous_key) values ('cvcheck', 'claude-haiku-5-5', true, 'anon-key')");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** A row in every table for the user: the ones the app writes as the user, and the two only the server writes. */
async function addEverything(userId: string) {
  await asUser(db, userId, async (tx) => {
    await tx.query("insert into public.profiles (data, cv_file_path) values ('{}', $1)", [`${userId}/cv.pdf`]);
    const { rows } = await tx.query<{ id: string }>("insert into public.jobs (data) values ('{}'), ('{}') returning id");
    for (const job of rows) {
      for (const table of ["match_results", "tailoring_changes", "tailored_cvs", "interview_sessions", "applications"]) {
        await tx.query(`insert into public.${table} (job_id, data) values ($1, '{}')`, [job.id]);
      }
    }
  });
  // events and ai_usage are closed to browsers: the server writes them with the secret key, which bypasses RLS.
  await db.query("insert into public.events (name, user_id) values ('tracker.status_changed', $1)", [userId]);
  await db.query("insert into public.ai_usage (feature, model, ok, user_id) values ('profile', 'claude-haiku-5-5', true, $1)", [userId]);
}

async function counts(userId: string) {
  const result: Record<string, number> = {};
  for (const table of userTables) {
    const { rows } = await db.query<{ count: number }>(`select count(*)::int as count from public.${table} where user_id = $1`, [userId]);
    result[table] = rows[0].count;
  }
  return result;
}

describe("the app's list of user tables", () => {
  it("is every public table with a user_id, so a new one cannot be left out of the download and the deletion", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by table_name",
    );
    expect(rows.map((row) => row.table_name)).toEqual([...userTables].sort());
  });

  it("deletes with the user: every foreign key to auth.users cascades, one from each of these tables", async () => {
    const { rows } = await db.query<{ table: string; on_delete: string }>(
      `select c.relname as table, k.confdeltype as on_delete
         from pg_constraint k
         join pg_class c on c.oid = k.conrelid
         join pg_namespace n on n.oid = c.relnamespace
        where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and n.nspname = 'public'
        order by c.relname`,
    );
    // confdeltype "c" is on delete cascade.
    expect(rows.filter((row) => row.on_delete !== "c")).toEqual([]);
    expect([...new Set(rows.map((row) => row.table))]).toEqual([...userTables].sort());
  });
});

describe("deleting a user from auth.users", () => {
  it("leaves no row of theirs in any of the user tables, and keeps everyone else's", async () => {
    const before = await counts(reza);
    expect(await counts(sara)).toEqual(before);
    expect(Object.values(before).every((count) => count > 0)).toBe(true);

    await db.query("delete from auth.users where id = $1", [sara]);

    expect(Object.values(await counts(sara))).toEqual(userTables.map(() => 0));
    expect(await counts(reza)).toEqual(before);

    // Records from before signing in belong to no account, so they stay: the confirmation page says so.
    const events = await db.query<{ count: number }>("select count(*)::int as count from public.events where anonymous_id = 'anon-key'");
    const usage = await db.query<{ count: number }>("select count(*)::int as count from public.ai_usage where anonymous_key = 'anon-key'");
    expect([events.rows[0].count, usage.rows[0].count]).toEqual([1, 1]);
  });
});
