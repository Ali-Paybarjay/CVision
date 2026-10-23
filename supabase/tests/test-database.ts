import { readdir, readFile } from "node:fs/promises";
import { PGlite, type Transaction } from "@electric-sql/pglite";

// The parts of Supabase our migrations build on, kept to what they use: the Data API's roles, auth.users and
// auth.uid() (which reads the user id from the request's JWT claims, as Supabase's does), and the storage tables
// behind the CV bucket.
const supabaseStub = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
`;

/**
 * A new in-memory Postgres (PGlite: real Postgres, no Docker) with every migration in supabase/migrations applied
 * in order, as on Supabase.
 */
export async function createTestDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(supabaseStub);
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  return db;
}

/**
 * Runs queries as a signed-in user, the way the Data API does: as the authenticated role, with the user's id in
 * the JWT claims, so row-level security applies. Everything runs in one transaction.
 */
export function asUser<T>(db: PGlite, userId: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    return run(tx);
  });
}
