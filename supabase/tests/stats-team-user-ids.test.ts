import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

// The stats schema (issue #162): stats.team_user_ids turns the team's emails into user ids for the daily-stats
// workflow, whose role cvision_stats may read public.events and public.ai_usage and run that function, and sees nobody's email.
// supabase/tests/active-users-query.test.ts runs the whole query as that role.

const ali = randomUUID();
const marziehAlias = randomUUID();
const demo = randomUUID();
const shayan = randomUUID();
const amy = randomUUID();
const lookalike = randomUUID();
const phoneOnly = randomUUID();
// In another case than the accounts, split by commas, spaces and new lines, with one entry as a + alias.
const teamList = "ali@team.example, Marzieh@Team.example\n demo+pilot@team.example shayan@team.example";
let db: PGlite;

/** Runs queries as the given role, as a connection that signed in with it would. Everything runs in one transaction. */
function asRole<T>(role: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return run(tx);
  });
}

/** The ids stats.team_user_ids gives for a list, sorted. */
async function teamIds(list: string, tx: Pick<PGlite, "query">): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>("select id from stats.team_user_ids($1) as team (id) order by id", [list]);
  return rows.map((row) => row.id);
}

/** Who besides the owner holds each privilege in an access list (proacl, nspacl), with public for everyone. */
function grantees(acl: string) {
  return `select coalesce(nullif(a.grantee, 0)::regrole::text, 'public') as grantee, a.privilege_type as privilege
    from aclexplode(${acl}) a
    where a.grantee <> a.grantor
    order by 1, 2`;
}

beforeAll(async () => {
  db = await createTestDatabase();
  for (const [id, email] of [
    // Stored in another case than the list.
    [ali, "Ali@Team.Example"],
    // A + alias of a listed address, in another case.
    [marziehAlias, "marzieh+test1@team.example"],
    // The base address of an alias on the list.
    [demo, "demo@team.example"],
    // Spaces around a stored email do not matter.
    [shayan, " shayan@team.example "],
    // Not on the list: a pilot, and an address that only contains a listed one.
    [amy, "amy@example.com"],
    [lookalike, "notali@team.example"],
    // An account with no email at all, such as a phone sign-in.
    [phoneOnly, null],
  ]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("stats.team_user_ids", () => {
  it("gives the ids of the accounts on the list, whatever the case, with every name+...@ alias of each address", async () => {
    const ids = await asRole("cvision_stats", (tx) => teamIds(teamList, tx));
    expect(ids).toEqual([ali, marziehAlias, demo, shayan].sort());
  });

  it("gives nothing for an empty list, or one of only commas and spaces", async () => {
    await asRole("cvision_stats", async (tx) => {
      expect(await teamIds("", tx)).toEqual([]);
      expect(await teamIds(" ,\n; ", tx)).toEqual([]);
    });
  });

  it("treats the list as data: a quote or a backslash in it changes nothing", async () => {
    const odd = "x'); select email from auth.users; --@example.com, back\\slash@example.com";
    const ids = await asRole("cvision_stats", (tx) => teamIds(`${odd}, ${teamList}`, tx));
    expect(ids).toEqual([ali, marziehAlias, demo, shayan].sort());
  });

  it("gives only ids, runs with its owner's rights and an empty search_path, and is stable", async () => {
    const { rows } = await db.query(
      `select pg_get_function_result(oid) as result, prosecdef, proconfig, provolatile
       from pg_proc where oid = 'stats.team_user_ids(text)'::regprocedure`,
    );
    expect(rows).toEqual([{ result: "SETOF uuid", prosecdef: true, proconfig: ['search_path=""'], provolatile: "s" }]);
  });

  it("may be run by cvision_stats only, through a schema only it may use", async () => {
    const { rows: functionGrants } = await db.query(
      grantees("(select proacl from pg_proc where oid = 'stats.team_user_ids(text)'::regprocedure)"),
    );
    expect(functionGrants).toEqual([{ grantee: "cvision_stats", privilege: "EXECUTE" }]);
    const { rows: schemaGrants } = await db.query(grantees("(select nspacl from pg_namespace where nspname = 'stats')"));
    expect(schemaGrants).toEqual([{ grantee: "cvision_stats", privilege: "USAGE" }]);
  });

  it.each(["anon", "authenticated"])("cannot be run by %s, which cannot use the stats schema either", async (role) => {
    const { rows } = await db.query(
      `select has_schema_privilege($1, 'stats', 'usage') as schema,
         has_function_privilege($1, 'stats.team_user_ids(text)', 'execute') as run`,
      [role],
    );
    expect(rows).toEqual([{ schema: false, run: false }]);
    await expect(asRole(role, (tx) => teamIds(teamList, tx))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("the cvision_stats role", () => {
  it("is made where it is missing without a login or password, with bypassrls and read-only sessions", async () => {
    const { rows } = await db.query(
      `select a.rolcanlogin, a.rolpassword, a.rolsuper, a.rolcreaterole, a.rolcreatedb, a.rolbypassrls, r.rolconfig
       from pg_authid a join pg_roles r on r.oid = a.oid
       where a.rolname = 'cvision_stats'`,
    );
    expect(rows).toEqual([
      {
        rolcanlogin: false,
        rolpassword: null,
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolbypassrls: true,
        rolconfig: ["default_transaction_read_only=on"],
      },
    ]);
  });

  it("may select from public.ai_usage and public.events and do nothing else with any table or column, however granted", async () => {
    // Every table and view outside Postgres's own catalogs, and each thing the role may do with it or any of its columns.
    const { rows } = await db.query<{ name: string; privilege: string }>(
      `select n.nspname || '.' || c.relname as name, p.privilege
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p (privilege)
       where c.relkind in ('r', 'v', 'm', 'p', 'f')
         and n.nspname not in ('pg_catalog', 'information_schema')
         and (
           has_table_privilege('cvision_stats', c.oid, p.privilege)
           or (
             p.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
             and has_any_column_privilege('cvision_stats', c.oid, p.privilege)
           )
         )
       order by 1, 2`,
    );
    expect(rows).toEqual([
      { name: "public.ai_usage", privilege: "SELECT" },
      { name: "public.events", privilege: "SELECT" },
    ]);
  });

  it("gets a permission error on auth.users, emails and ids alike", async () => {
    for (const column of ["email", "id"]) {
      await expect(asRole("cvision_stats", (tx) => tx.query(`select ${column} from auth.users`))).rejects.toMatchObject({
        code: "42501",
      });
    }
  });

  it("keeps the login it already has on live: the migration applies again and takes away only its access to auth", async () => {
    const migrations = new URL("../migrations/", import.meta.url);
    const file = (await readdir(migrations)).find((name) => name.endsWith("_stats_team_user_ids.sql"));
    const sql = await readFile(new URL(file ?? "missing", migrations), "utf8");

    const result = await db.transaction(async (tx) => {
      // What Ali set up by hand on live before this migration: a login, the auth schema and two columns of auth.users.
      await tx.exec(`
        alter role cvision_stats login;
        grant usage on schema auth to cvision_stats;
        grant select (id, email) on auth.users to cvision_stats;
        drop schema stats cascade;
      `);
      const check = `select r.rolcanlogin, r.rolbypassrls,
          has_schema_privilege('cvision_stats', 'auth', 'usage') as auth_schema,
          has_any_column_privilege('cvision_stats', 'auth.users', 'select') as auth_users,
          has_table_privilege('cvision_stats', 'public.events', 'select') as events
        from pg_roles r where r.rolname = 'cvision_stats'`;
      const before = (await tx.query(check)).rows;
      await tx.exec(sql);
      const after = (await tx.query(check)).rows;
      await tx.exec("set local role cvision_stats");
      const ids = await teamIds(teamList, tx);
      await tx.rollback();
      return { before, after, ids };
    });

    expect(result.before).toEqual([{ rolcanlogin: true, rolbypassrls: true, auth_schema: true, auth_users: true, events: true }]);
    expect(result.after).toEqual([{ rolcanlogin: true, rolbypassrls: true, auth_schema: false, auth_users: false, events: true }]);
    expect(result.ids).toEqual([ali, marziehAlias, demo, shayan].sort());
  });
});
