import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

// supabase/queries/active-users.sql is what the daily-stats workflow runs with psql every morning, and what a person
// pastes into the SQL Editor (card #155). These tests run the file itself on fictional accounts and events.

const queryFile = new URL("../queries/active-users.sql", import.meta.url);
const variable = ":'team_emails'";

/** The columns the workflow reads, by name and in this order. */
const columns = ["day", "active_users", "new_active_users", "checks", "signed_in_people", "anonymous_visitors"];

/**
 * psql's :'team_emails' as one SQL string literal, quoted the way psql quotes it (libpq's PQescapeLiteral): single
 * quotes doubled, and backslashes doubled behind an E when there are any. PGlite runs no psql, so the test puts the
 * value in itself, exactly as psql would.
 */
function psqlLiteral(value: string): string {
  const quoted = `'${value.replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
  return value.includes("\\") ? ` E${quoted}` : quoted;
}

type Row = Record<(typeof columns)[number], string | number>;

async function runQuery(teamEmails: string, database: Pick<PGlite, "query"> = db): Promise<Row[]> {
  const sql = await readFile(queryFile, "utf8");
  // A function, so a $ in the list is never read as a replacement pattern.
  const { rows } = await database.query<Row>(sql.replace(variable, () => psqlLiteral(teamEmails)));
  // count() is a bigint: compare plain numbers.
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "day" ? value : Number(value)])));
}

function day(rows: Row[], date: string): Row | undefined {
  return rows.find((row) => row.day === date);
}

const amy = randomUUID();
const ben = randomUUID();
const cara = randomUUID();
const dan = randomUUID();
const ella = randomUUID();
const teamAli = randomUUID();
const teamMarziehAlias = randomUUID();
const teamList = "ali@team.example, Marzieh@Team.example";
let db: PGlite;

async function addEvent(name: string, at: string, who: { user?: string; anonymous?: string }, properties: object = {}) {
  await db.query("insert into public.events (name, user_id, anonymous_id, properties, created_at) values ($1, $2, $3, $4, $5)", [
    name,
    who.user ?? null,
    who.anonymous ?? null,
    JSON.stringify(properties),
    at,
  ]);
}

beforeAll(async () => {
  db = await createTestDatabase();
  // Supabase's auth.users has an email column; the shared stub keeps only id.
  await db.exec("alter table auth.users add column email text");
  for (const [id, email] of [
    [amy, "amy@example.com"],
    [ben, "ben@example.com"],
    [cara, "cara@example.com"],
    [dan, "dan@example.com"],
    [ella, "Ella@Example.com"],
    [teamAli, "ali@team.example"],
    // A + alias of a listed address, in another case: left out through the base address.
    [teamMarziehAlias, "marzieh+test1@team.example"],
  ]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }

  // 20 January, GMT: 23:30 UTC is still 20 January in London.
  await addEvent("tailor.change_approved", "2026-01-20T23:30:00Z", { user: amy });

  // 14 July, BST: 22:30 UTC is 23:30 on the 14th in London, 23:30 UTC is already the 15th.
  await addEvent("tailor.cv_exported", "2026-07-14T22:30:00Z", { user: ben }, { document: "cv", approvedChanges: 2 });
  await addEvent("tailor.change_approved", "2026-07-14T23:30:00Z", { user: amy });
  await addEvent("interview.session_completed", "2026-07-14T23:30:00Z", { user: dan });
  await addEvent("interview.session_completed", "2026-07-15T10:00:00Z", { user: dan });
  await addEvent("interview.session_completed", "2026-07-16T09:00:00Z", { user: dan });
  await addEvent("tailor.cv_exported", "2026-07-15T08:00:00Z", { user: ella }, { document: "cover-letter" });

  // Signed in, but nothing that makes Cara active.
  await addEvent("profile.cv_uploaded", "2026-07-14T12:00:00Z", { user: cara });
  await addEvent("jobs.ad_pasted", "2026-07-14T12:00:00Z", { user: cara });
  await addEvent("tailor.change_rejected", "2026-07-14T12:00:00Z", { user: cara });
  await addEvent("tailor.apply_clicked", "2026-07-14T12:00:00Z", { user: cara });
  await addEvent("tailor.cv_exported", "2026-07-14T12:00:00Z", { user: cara }, { document: "cv", approvedChanges: 0 });

  // Work without an account makes nobody active.
  await addEvent("tailor.change_approved", "2026-07-15T12:00:00Z", { anonymous: "anon-tailor" });

  // Team accounts: active, and one CV check signed in.
  await addEvent("tailor.change_approved", "2026-07-15T12:00:00Z", { user: teamAli });
  await addEvent("cvcheck.completed", "2026-07-15T12:00:00Z", { user: teamAli });
  await addEvent("interview.session_completed", "2026-07-14T12:00:00Z", { user: teamMarziehAlias });

  // CV checks: Cara signed in, and two visitors without an account on both sides of London midnight.
  await addEvent("cvcheck.completed", "2026-07-14T12:00:00Z", { user: cara });
  await addEvent("cvcheck.completed", "2026-07-14T22:30:00Z", { anonymous: "anon-1" });
  await addEvent("cvcheck.completed", "2026-07-14T23:30:00Z", { anonymous: "anon-1" });
  await addEvent("cvcheck.completed", "2026-07-15T12:00:00Z", { anonymous: "anon-2" });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("supabase/queries/active-users.sql", () => {
  it("takes the team list from one psql variable, used once and in no comment", async () => {
    const sql = await readFile(queryFile, "utf8");
    expect(sql.split(variable)).toHaveLength(2);
  });

  it("gives the columns the daily-stats workflow reads, by name and in order", async () => {
    const rows = await runQuery(teamList);
    expect(Object.keys(rows[0])).toEqual(columns);
  });

  it("gives a Total row, then every London day from the first active user or check to today, newest first", async () => {
    const rows = await runQuery(teamList);
    const { rows: today } = await db.query<{ today: string }>("select (now() at time zone 'Europe/London')::date::text as today");
    expect(rows[0].day).toBe("Total");
    expect(rows[1].day).toBe(today[0].today);
    expect(rows.at(-1)?.day).toBe("2026-01-20");
    const days = rows.slice(1).map((row) => String(row.day));
    expect(days).toEqual([...days].sort().reverse());
    expect(new Set(days).size).toBe(days.length);
    // A day with neither an active user nor a check still has a row, with 0.
    expect(day(rows, "2026-01-21")).toEqual({
      day: "2026-01-21",
      active_users: 0,
      new_active_users: 0,
      checks: 0,
      signed_in_people: 0,
      anonymous_visitors: 0,
    });
  });

  it("counts active users per London day and in total, without the accounts on the list or their aliases", async () => {
    const rows = await runQuery(teamList);
    expect(day(rows, "Total")).toMatchObject({ active_users: 4, new_active_users: 4 });
    // 23:30 UTC in winter is the same London day.
    expect(day(rows, "2026-01-20")).toMatchObject({ active_users: 1, new_active_users: 1 });
    // Ben at 23:30 BST. Cara's events make nobody active, and the team's interview practice is left out.
    expect(day(rows, "2026-07-14")).toMatchObject({ active_users: 1, new_active_users: 1 });
    // Amy (back after midnight BST), Dan and Ella's cover letter; Dan and Ella for the first time. Not the team.
    expect(day(rows, "2026-07-15")).toMatchObject({ active_users: 3, new_active_users: 2 });
    expect(day(rows, "2026-07-16")).toMatchObject({ active_users: 1, new_active_users: 0 });
  });

  it("counts CV checks apart, without signed-in checks by accounts on the list", async () => {
    const rows = await runQuery(teamList);
    expect(day(rows, "Total")).toMatchObject({ checks: 4, signed_in_people: 1, anonymous_visitors: 2 });
    expect(day(rows, "2026-07-14")).toMatchObject({ checks: 2, signed_in_people: 1, anonymous_visitors: 1 });
    expect(day(rows, "2026-07-15")).toMatchObject({ checks: 2, signed_in_people: 0, anonymous_visitors: 2 });
  });

  it("counts the team too when the list is empty, and reads a list split by new lines the same as by commas", async () => {
    expect(day(await runQuery(""), "Total")).toMatchObject({ active_users: 6, checks: 5, signed_in_people: 2 });
    expect(await runQuery("\n ali@team.example\r\nmarzieh@team.example \n")).toEqual(await runQuery(teamList));
  });

  it("treats the list as data: a quote or a backslash in it changes nothing", async () => {
    const odd = "x'); delete from public.events; --@example.com, back\\slash@example.com";
    expect(await runQuery(`${odd}, ${teamList}`)).toEqual(await runQuery(teamList));
    const { rows } = await db.query<{ count: number }>("select count(*)::int as count from public.events");
    expect(rows[0].count).toBeGreaterThan(0);
  });

  it("gives only a Total row of zeros before anyone is active or checks a CV", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec("delete from public.events");
      const result = await runQuery(teamList, tx);
      await tx.rollback();
      return result;
    });
    expect(rows).toEqual([
      { day: "Total", active_users: 0, new_active_users: 0, checks: 0, signed_in_people: 0, anonymous_visitors: 0 },
    ]);
  });
});
