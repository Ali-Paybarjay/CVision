import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase } from "./test-database";

// The tables whose rows belong to one job (issue #28; tailored_cvs from issue #67).
const jobTables = ["match_results", "tailoring_changes", "tailored_cvs", "interview_sessions", "applications"] as const;
type JobTable = (typeof jobTables)[number];

const sara = randomUUID();
const reza = randomUUID();
let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query("insert into auth.users (id) values ($1), ($2)", [sara, reza]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Saves a job as the user, the way the app does, and returns its id. */
async function addJob(userId: string): Promise<string> {
  const { rows } = await asUser(db, userId, (tx) => tx.query<{ id: string }>("insert into public.jobs (data) values ('{}') returning id"));
  return rows[0].id;
}

/** Adds a row for the job to one of the job's tables, as the user. Without an owner, user_id defaults to the user. */
function addRow(userId: string, table: JobTable, jobId: string, owner?: string) {
  return asUser(db, userId, (tx) =>
    owner
      ? tx.query(`insert into public.${table} (user_id, job_id, data) values ($1, $2, '{}')`, [owner, jobId])
      : tx.query(`insert into public.${table} (job_id, data) values ($1, '{}')`, [jobId]),
  );
}

describe("rows that belong to a job", () => {
  it.each(jobTables)("%s refuses a row for another user's job", async (table) => {
    const sarasJob = await addJob(sara);

    // With Reza's own user id the composite key refuses it (23503); with Sara named as the owner, row-level security does (42501).
    await expect(addRow(reza, table, sarasJob)).rejects.toMatchObject({ code: "23503" });
    await expect(addRow(reza, table, sarasJob, sara)).rejects.toMatchObject({ code: "42501" });
  });

  it.each(jobTables)("%s accepts a row for the user's own job", async (table) => {
    const sarasJob = await addJob(sara);

    await expect(addRow(sara, table, sarasJob)).resolves.toMatchObject({ affectedRows: 1 });
  });

  it.each(jobTables)("%s refuses moving a row to another user's job", async (table) => {
    const sarasJob = await addJob(sara);
    const rezasJob = await addJob(reza);
    await addRow(reza, table, rezasJob);

    const move = asUser(db, reza, (tx) => tx.query(`update public.${table} set job_id = $1 where job_id = $2`, [sarasJob, rezasJob]));

    await expect(move).rejects.toMatchObject({ code: "23503" });
  });

  it("deletes a job's rows with the job", async () => {
    const job = await addJob(sara);
    for (const table of jobTables) await addRow(sara, table, job);

    await asUser(db, sara, (tx) => tx.query("delete from public.jobs where id = $1", [job]));

    for (const table of jobTables) {
      const { rows } = await db.query(`select count(*)::int as count from public.${table} where job_id = $1`, [job]);
      expect(rows).toEqual([{ count: 0 }]);
    }
  });
});

describe("applications", () => {
  it("keeps one application per job for each user", async () => {
    const job = await addJob(sara);
    await addRow(sara, "applications", job);

    await expect(addRow(sara, "applications", job)).rejects.toMatchObject({ code: "23505" });
  });
});

describe("tailored_cvs", () => {
  it("keeps one saved version per job for each user", async () => {
    const job = await addJob(sara);
    await addRow(sara, "tailored_cvs", job);

    await expect(addRow(sara, "tailored_cvs", job)).rejects.toMatchObject({ code: "23505" });
  });

  it("is the owner's alone: another user cannot see, change or delete it, and a visitor cannot reach the table", async () => {
    const job = await addJob(sara);
    await addRow(sara, "tailored_cvs", job);

    const asReza = (sql: string) => asUser(db, reza, (tx) => tx.query(sql, [job]));
    await expect(asReza("select id from public.tailored_cvs where job_id = $1")).resolves.toMatchObject({ rows: [] });
    await expect(asReza(`update public.tailored_cvs set data = '{"changed": true}' where job_id = $1`)).resolves.toMatchObject({ affectedRows: 0 });
    await expect(asReza("delete from public.tailored_cvs where job_id = $1")).resolves.toMatchObject({ affectedRows: 0 });

    const asVisitor = db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return tx.query("select id from public.tailored_cvs");
    });
    await expect(asVisitor).rejects.toMatchObject({ code: "42501" });

    const { rows } = await asUser(db, sara, (tx) => tx.query("select data from public.tailored_cvs where job_id = $1", [job]));
    expect(rows).toEqual([{ data: {} }]);
  });
});
