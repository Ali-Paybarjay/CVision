import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

// The reporting schema (issue #160): daily AI totals that Shayan reads through the ai_usage_reader role, which may read
// nothing else. These tests read the views as that role, on fictional usage rows and events.

const views = ["ai_usage_daily", "ai_events_daily"] as const;

/** Each view's columns, by name and in order: what Shayan's queries read. None says whose a request was. */
const columns: Record<(typeof views)[number], string[]> = {
  ai_usage_daily: [
    "day",
    "feature",
    "model",
    "requests",
    "refused_or_invalid",
    "never_filled",
    "input_tokens",
    "output_tokens",
    "cost_usd",
  ],
  ai_events_daily: ["day", "event", "feature", "error", "status", "daily_limit", "events"],
};

const sara = randomUUID();
let db: PGlite;

/** Runs queries as the given role, as a connection that signed in with it would. Everything runs in one transaction. */
function asRole<T>(role: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return run(tx);
  });
}

const asReader = <T>(run: (tx: Transaction) => Promise<T>) => asRole("ai_usage_reader", run);

/** Every row of a view, sorted, with the day as text, counts and sums as plain numbers, and the cost as exact text. */
async function readView(view: (typeof views)[number], tx: Pick<PGlite, "query">) {
  const select = columns[view].map((column) => (column === "day" ? "day::text as day" : column)).join(", ");
  const { rows } = await tx.query<Record<string, unknown>>(
    `select ${select} from reporting.${view} order by ${columns[view].slice(0, -1).join(", ")}`,
  );
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value])),
  );
}

let usageRows = 0;

async function addUsage(at: string, feature: string, model: string, used: { input: number; output: number; cost: string; ok: boolean }) {
  // Every other row is Sara's, the rest a visitor's: neither shows in the views.
  const who = usageRows++ % 2 === 0 ? { user: sara, anonymous: null } : { user: null, anonymous: "anon-key" };
  await db.query(
    `insert into public.ai_usage (user_id, anonymous_key, feature, model, input_tokens, output_tokens, cost_usd, ok, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [who.user, who.anonymous, feature, model, used.input, used.output, used.cost, used.ok, at],
  );
}

async function addEvent(name: string, at: string, properties: object) {
  await db.query("insert into public.events (name, properties, created_at) values ($1, $2, $3)", [name, JSON.stringify(properties), at]);
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query("insert into auth.users (id) values ($1)", [sara]);

  const haiku = "claude-haiku-5-5";
  // 14 July: the last second of the UTC day (already 00:59 on the 15th in London) and the first of the next.
  await addUsage("2026-07-14T23:59:59Z", "profile-extract", haiku, { input: 1000, output: 200, cost: "0.000200", ok: true });
  await addUsage("2026-07-15T00:00:00Z", "profile-extract", haiku, { input: 1000, output: 200, cost: "0.000200", ok: true });
  // An answer that did not fit keeps its tokens; a reserved row never filled in has none.
  await addUsage("2026-07-14T09:00:00Z", "profile-extract", haiku, { input: 900, output: 150, cost: "0.000165", ok: false });
  await addUsage("2026-07-14T09:05:00Z", "profile-extract", haiku, { input: 0, output: 0, cost: "0", ok: false });
  // A refusal can use output tokens only.
  await addUsage("2026-07-14T09:10:00Z", "profile-extract", haiku, { input: 0, output: 5, cost: "0.000003", ok: false });
  // Another feature and another model on the same day have rows of their own.
  await addUsage("2026-07-14T12:00:00Z", "cv-check", haiku, { input: 2000, output: 400, cost: "0.000400", ok: true });
  await addUsage("2026-07-14T12:00:00Z", "profile-extract", "claude-sonnet-5-5", { input: 100, output: 10, cost: "0.000300", ok: true });

  await addEvent("ai.failed", "2026-07-14T23:59:59Z", { feature: "profile-extract", error: "RateLimitError", status: 429 });
  await addEvent("ai.failed", "2026-07-14T22:00:00Z", { feature: "profile-extract", error: "RateLimitError", status: 429 });
  await addEvent("ai.failed", "2026-07-15T00:00:00Z", { feature: "profile-extract", error: "RateLimitError", status: 429 });
  await addEvent("ai.failed", "2026-07-14T10:00:00Z", { feature: "tailor-cv", error: "APIError", status: 402 });
  await addEvent("ai.failed", "2026-07-14T11:00:00Z", { feature: "tailor-cv", error: "APIConnectionTimeoutError" });
  // A status that is not a number is left empty rather than breaking the view.
  await addEvent("ai.failed", "2026-07-14T11:30:00Z", { feature: "tailor-cv", error: "Error", status: "oops" });
  await addEvent("ai.limited", "2026-07-14T15:00:00Z", { feature: "cv-check", limit: "perAnonymousVisitor" });
  await addEvent("ai.limited", "2026-07-14T16:00:00Z", { feature: "cv-check", limit: "perAnonymousVisitor" });
  await addEvent("ai.limited", "2026-07-14T17:00:00Z", { feature: "tailor-cv", limit: "perUser" });
  // Other events stay out.
  await addEvent("ai.hidden_text_removed", "2026-07-14T12:00:00Z", { feature: "profile-extract", removed: 3 });
  await addEvent("home.cta_clicked", "2026-07-14T12:00:00Z", { cta: "cv_check", placement: "hero" });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("reporting.ai_usage_daily", () => {
  it("adds up each UTC day, feature and model, with failed answers and unfilled rows apart", async () => {
    const rows = await asReader((tx) => readView("ai_usage_daily", tx));
    expect(rows).toEqual([
      {
        day: "2026-07-14",
        feature: "cv-check",
        model: "claude-haiku-5-5",
        requests: 1,
        refused_or_invalid: 0,
        never_filled: 0,
        input_tokens: 2000,
        output_tokens: 400,
        cost_usd: "0.000400",
      },
      {
        day: "2026-07-14",
        feature: "profile-extract",
        model: "claude-haiku-5-5",
        requests: 4,
        refused_or_invalid: 2,
        never_filled: 1,
        input_tokens: 1900,
        output_tokens: 355,
        cost_usd: "0.000368",
      },
      {
        day: "2026-07-14",
        feature: "profile-extract",
        model: "claude-sonnet-5-5",
        requests: 1,
        refused_or_invalid: 0,
        never_filled: 0,
        input_tokens: 100,
        output_tokens: 10,
        cost_usd: "0.000300",
      },
      {
        day: "2026-07-15",
        feature: "profile-extract",
        model: "claude-haiku-5-5",
        requests: 1,
        refused_or_invalid: 0,
        never_filled: 0,
        input_tokens: 1000,
        output_tokens: 200,
        cost_usd: "0.000200",
      },
    ]);
  });
});

describe("reporting.ai_events_daily", () => {
  it("counts ai.failed and ai.limited per UTC day, feature, error, status and limit, and nothing else", async () => {
    const rows = await asReader((tx) => readView("ai_events_daily", tx));
    const failed = { event: "ai.failed", daily_limit: null };
    const limited = { event: "ai.limited", error: null, status: null };
    expect(rows).toEqual([
      // 22:00 and 23:59:59 UTC on the 14th; midnight is the 15th.
      { day: "2026-07-14", ...failed, feature: "profile-extract", error: "RateLimitError", status: 429, events: 2 },
      { day: "2026-07-14", ...failed, feature: "tailor-cv", error: "APIConnectionTimeoutError", status: null, events: 1 },
      { day: "2026-07-14", ...failed, feature: "tailor-cv", error: "APIError", status: 402, events: 1 },
      { day: "2026-07-14", ...failed, feature: "tailor-cv", error: "Error", status: null, events: 1 },
      { day: "2026-07-14", ...limited, feature: "cv-check", daily_limit: "perAnonymousVisitor", events: 2 },
      { day: "2026-07-14", ...limited, feature: "tailor-cv", daily_limit: "perUser", events: 1 },
      { day: "2026-07-15", ...failed, feature: "profile-extract", error: "RateLimitError", status: 429, events: 1 },
    ]);
  });
});

describe("the reporting views", () => {
  it.each(views)("%s has only the agreed columns: no user id or visitor code", async (view) => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'reporting' and table_name = $1 order by ordinal_position",
      [view],
    );
    const names = rows.map((row) => row.column_name);
    expect(names).toEqual(columns[view]);
    expect(names.filter((name) => /user|anonymous/.test(name))).toEqual([]);
  });

  it("give the same UTC days whatever the session's time zone", async () => {
    for (const view of views) {
      const elsewhere = await asReader(async (tx) => {
        await tx.exec("set local timezone = 'Pacific/Auckland'");
        return readView(view, tx);
      });
      expect(elsewhere).toEqual(await asReader((tx) => readView(view, tx)));
    }
  });

  it("are the only things in the reporting schema", async () => {
    const { rows } = await db.query<{ name: string }>(
      "select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'reporting' order by 1",
    );
    expect(rows.map((row) => row.name)).toEqual([...views].sort());
  });
});

describe("the ai_usage_reader role", () => {
  it("cannot sign in until Ali allows it in Supabase, and has no password", async () => {
    const { rows } = await db.query("select rolcanlogin, rolpassword, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_authid where rolname = 'ai_usage_reader'");
    expect(rows).toEqual([
      { rolcanlogin: false, rolpassword: null, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false },
    ]);
  });

  it("may select from the two views and do nothing else with any table, its own grants and everyone's together", async () => {
    // Every table and view outside Postgres's own catalogs, and each thing the role may do with it, however granted.
    const { rows } = await db.query<{ name: string; privilege: string }>(
      `select n.nspname || '.' || c.relname as name, p.privilege
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p (privilege)
       where c.relkind in ('r', 'v', 'm', 'p', 'f')
         and n.nspname not in ('pg_catalog', 'information_schema')
         and has_table_privilege('ai_usage_reader', c.oid, p.privilege)
       order by 1, 2`,
    );
    expect(rows).toEqual([
      { name: "reporting.ai_events_daily", privilege: "SELECT" },
      { name: "reporting.ai_usage_daily", privilege: "SELECT" },
    ]);
  });

  it.each(["public.ai_usage", "public.events", "public.profiles", "auth.users"])("cannot read %s", async (table) => {
    await expect(asReader((tx) => tx.query(`select * from ${table} limit 1`))).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot change the rows behind the views", async () => {
    await expect(
      asReader((tx) => tx.query("insert into public.events (name) values ('ai.failed')")),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(asReader((tx) => tx.query("delete from public.ai_usage"))).rejects.toMatchObject({ code: "42501" });
  });

  it.each([
    ["ai_usage_daily", "feature"],
    ["ai_events_daily", "event"],
  ] as const)("sees only the rows %s gives back, even through a function of its own", async (view, column) => {
    // Like any role, the reader may make temporary functions. A cheap one in its WHERE that reports what it is given
    // must only see the view's own rows (security_barrier), never every row of the table, such as other events.
    const seen: string[] = [];
    const returned = await asReader(async (tx) => {
      await tx.exec(`
        create function pg_temp.peek(value text) returns boolean language plpgsql immutable cost 0.0000001 as $$
        begin
          raise notice '%', value;
          return true;
        end;
        $$;
        set local enable_indexscan = off;
        set local enable_bitmapscan = off;
      `);
      const { rows } = await tx.query<Record<string, string>>(`select ${column} from reporting.${view} where pg_temp.peek(${column})`, [], {
        onNotice: (notice) => seen.push(notice.message ?? ""),
      });
      await tx.rollback();
      return rows.map((row) => row[column]);
    });
    expect(seen.sort()).toEqual(returned.sort());
  });

  it.each(["anon", "authenticated"])("is the only one: %s cannot read the views", async (role) => {
    for (const view of views) {
      await expect(asRole(role, (tx) => tx.query(`select * from reporting.${view}`))).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("is created only once: the migration applies again where the role is already there, as after a local reset", async () => {
    const migrations = new URL("../migrations/", import.meta.url);
    const file = (await readdir(migrations)).find((name) => name.endsWith("_ai_usage_reporting.sql"));
    const sql = await readFile(new URL(file ?? "missing", migrations), "utf8");

    const grants = await db.transaction(async (tx) => {
      await tx.exec("drop schema reporting cascade");
      await tx.exec(sql);
      const { rows } = await tx.query(
        "select count(*)::int as count from pg_class c where has_table_privilege('ai_usage_reader', c.oid, 'SELECT') and c.relnamespace = 'reporting'::regnamespace",
      );
      await tx.rollback();
      return rows;
    });
    expect(grants).toEqual([{ count: 2 }]);
  });
});
