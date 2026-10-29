import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

// supabase/queries/ai-cost.sql is what the ai-cost-report workflow runs with psql when someone starts it by hand. These
// tests run the file itself on fictional requests, as the workflow's role cvision_stats, so they also prove that role
// may read what the file reads (issue #203: nothing ran it as that role, and its first run would have failed).

const queryFile = new URL("../queries/ai-cost.sql", import.meta.url);
const workflowFile = new URL("../../.github/workflows/ai-cost-report.yml", import.meta.url);

/** The columns the workflow reads, by name and in this order. */
const columns = ["group", "feature", "requests", "accounts", "input_tokens", "output_tokens", "cost_usd", "log_rows"];

type Row = Record<string, string | number>;

/** psql's :'name' as one SQL string literal, quoted the way psql quotes it. The times hold no quote or backslash. */
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * Runs the file the way the ai-cost-report workflow does: as cvision_stats, in a read-only transaction. Given a
 * transaction, runs it in that one, after whatever the test did there first.
 */
async function runQuery(from: string, to: string, tx?: Transaction): Promise<Row[]> {
  if (!tx) return db.transaction((own) => runQuery(from, to, own));
  const sql = (await readFile(queryFile, "utf8"))
    .replace(":'from_london'", () => literal(from))
    .replace(":'to_london'", () => literal(to));
  await tx.exec("set local role cvision_stats; set transaction read only");
  const { rows } = await tx.query<Row>(sql);
  // count() and sum() are bigint or numeric: compare plain numbers.
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "group" || key === "feature" ? value : Number(value)])),
  );
}

const total = (rows: Row[]) => rows.find((row) => row.group === "total" && row.feature === "total");

const amy = randomUUID();
const ben = randomUUID();
let db: PGlite;

async function addRequest(feature: string, at: string, who: { user?: string; anonymous?: string }, cost: number) {
  await db.query(
    "insert into public.ai_usage (user_id, anonymous_key, feature, model, input_tokens, output_tokens, cost_usd, ok, created_at) values ($1, $2, $3, 'claude-haiku-5-5', 1000, 500, $4, true, $5)",
    [who.user ?? null, who.anonymous ?? null, feature, cost, at],
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  for (const id of [amy, ben]) await db.query("insert into auth.users (id) values ($1)", [id]);

  // The window is 14 July 10:00 to 10:40 in London, which is BST: 09:00 to 09:40 UTC.
  await addRequest("profile-extract", "2026-07-14T09:05:00Z", { user: amy }, 0.002);
  await addRequest("tailor-propose", "2026-07-14T09:10:00Z", { user: amy }, 0.001);
  await addRequest("tailor-propose", "2026-07-14T09:20:00Z", { user: ben }, 0.003);
  // The free CV check has no account.
  await addRequest("cv-check", "2026-07-14T09:30:00Z", { anonymous: "visitor-1" }, 0.0005);
  // Just outside: before the start, and at the end itself.
  await addRequest("profile-extract", "2026-07-14T08:59:59Z", { user: ben }, 0.9);
  await addRequest("tailor-propose", "2026-07-14T09:40:00Z", { user: ben }, 0.9);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("supabase/queries/ai-cost.sql", () => {
  it("takes the window from two psql variables, each used once", async () => {
    const sql = await readFile(queryFile, "utf8");
    expect(sql.split(":'from_london'")).toHaveLength(2);
    expect(sql.split(":'to_london'")).toHaveLength(2);
  });

  it("is in step with the ai-cost-report workflow: the same columns, in order", async () => {
    const rows = await runQuery("2026-07-14 10:00", "2026-07-14 10:40");
    expect(Object.keys(rows[0])).toEqual(columns);
    const workflow = await readFile(workflowFile, "utf8");
    expect(workflow).toContain(`expected="${columns.join(",")}"`);
  });

  it("adds up only the requests inside the London window, counting accounts but not visitors", async () => {
    const rows = await runQuery("2026-07-14 10:00", "2026-07-14 10:40");
    expect(total(rows)).toMatchObject({ requests: 4, accounts: 2, input_tokens: 4000, output_tokens: 2000, cost_usd: 0.0065, log_rows: 6 });
    expect(rows.find((row) => row.group === "per-job" && row.feature === "total")).toMatchObject({ requests: 2, cost_usd: 0.004 });
    expect(rows.find((row) => row.feature === "cv-check")).toMatchObject({ group: "cv-check", requests: 1, accounts: 0 });
  });

  it("still gives the total row, with zeros, for a window with no request", async () => {
    const rows = await runQuery("2026-07-15 10:00", "2026-07-15 10:40");
    expect(rows).toEqual([{ group: "total", feature: "total", requests: 0, accounts: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, log_rows: 6 }]);
  });

  it("needs the role's select on public.ai_usage: without it the query stops with a permission error", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("revoke select on public.ai_usage from cvision_stats");
        return runQuery("2026-07-14 10:00", "2026-07-14 10:40", tx);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
