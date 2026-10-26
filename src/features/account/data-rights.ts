import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { brand } from "@/shared/brand";
import { getSupabaseAdmin } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { CurrentUser } from "./current-user";
import { serverOnlyTables, userTables, type UserTable } from "./user-tables";
import { zipChunks, type ZipEntry } from "./zip";

// Your data is yours (issue #43): what we hold about a user, the download of all of it, and deleting the account.
// Everything here runs on the server, filtered by the user id from the session. The user's own tables are read as
// the user, so row-level security checks that id as well. The admin client (secret key) reads only what browsers
// cannot (events, ai_usage, the account's details and the CV files) and does the deleting.

export { userTables, type UserTable };

export type DataSummary = { rows: Record<UserTable, number>; cvFiles: number };

export type DataExport = { fileName: string; chunks: Uint8Array[]; summary: DataSummary };

export type DeleteAccountResult =
  | { ok: true; summary: DataSummary }
  | { ok: false; reason: "not-connected" }
  /**
   * start: nothing was deleted. files: the account and its rows are not deleted; cvFilesRemoved CV files are gone,
   * and if removeAttempted, more may be (Storage can delete files and still answer with an error).
   * account: every CV file is gone, the account and its rows are not.
   */
  | { ok: false; reason: "failed"; step: "start" | "files" | "account"; cvFilesRemoved: number; removeAttempted: boolean };

type Failure = { ok: false; reason: "not-connected" | "failed" };

/** Who reads which table: the user's own session for their tables, the admin client for the server-only ones. */
type Readers = { own: SupabaseClient; admin: SupabaseClient };

const cvBucket = "cvs";
// Supabase returns at most 1,000 rows per request. Storage lists 100 entries per page by default; keep to that.
const pageSize = 1000;
const listPageSize = 100;
const removeBatchSize = 100;

const notConnected = { ok: false, reason: "not-connected" } as const;

/** How many rows of each table and how many CV files the user has: what "Delete my account" removes. */
export async function summariseUserData(userId: string): Promise<{ ok: true; summary: DataSummary } | Failure> {
  const readers = await getReaders();
  if (!readers) return notConnected;
  try {
    return { ok: true, summary: await summarise(readers, userId) };
  } catch (error) {
    return failed(error);
  }
}

export function totalRows(summary: DataSummary): number {
  return userTables.reduce((sum, table) => sum + summary.rows[table], 0);
}

/**
 * Everything we hold about the user in one ZIP: data.json with their account's details and every row of the user
 * tables, and their original CV files under cv-files/. Built in full before anything is sent, so a failure never
 * gives the user half a file.
 */
export async function exportUserData(user: CurrentUser, now: Date): Promise<({ ok: true } & DataExport) | Failure> {
  const readers = await getReaders();
  if (!readers) return notConnected;
  try {
    const { data: auth, error } = await readers.admin.auth.admin.getUserById(user.id);
    if (error) throw new StepError("read the account", error);

    const tables = {} as Record<UserTable, Record<string, unknown>[]>;
    for (const table of userTables) tables[table] = await readRows(readerFor(readers, table), table, user.id);

    const files: ZipEntry[] = [];
    for (const path of await listCvFiles(readers.admin, user.id)) {
      files.push({ name: `cv-files/${archivePath(path.slice(user.id.length + 1))}`, data: await download(readers.admin, path) });
    }

    const exportedAt = now.toISOString();
    const data = {
      about: `Everything ${brand.name} holds about your account, apart from what notIncluded lists. account has your account's details from our sign-in service, tables has every row we store for you, by table, and cvFiles lists the CV files saved next to this file.`,
      notIncluded: [
        "The IP address and browser details our sign-in service records for each device you sign in on. They are deleted when you sign out on that device or delete your account.",
        `Anything ${brand.name} saved only in a browser, such as a profile or interview practice that is not saved to your account. Download it from the Your data page in that browser.`,
        "Copies in our service providers' backups and logs, which they keep for a limited time. Our Privacy page lists them and how long each is kept.",
      ],
      exportedAt,
      account: accountDetails(auth.user),
      tables,
      cvFiles: files.map((file) => file.name),
    };
    const json = new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);

    return {
      ok: true,
      fileName: `cvision-data-${exportedAt.slice(0, 10)}.zip`,
      chunks: zipChunks([{ name: "data.json", data: json }, ...files], now),
      summary: { rows: countsOf(tables), cvFiles: files.length },
    };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Deletes the user's account for good: first every file under cvs/<user id>/ (Supabase cannot delete a user who
 * still owns Storage objects), then the user, whose rows in the user tables go with them (on delete cascade).
 * Says honestly how far it got when a step fails. Signing out and clearing the browser are up to the caller.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return notConnected;

  let summary: DataSummary;
  try {
    summary = await summarise({ own: admin, admin }, userId);
  } catch (error) {
    failed(error);
    return { ok: false, reason: "failed", step: "start", cvFilesRemoved: 0, removeAttempted: false };
  }

  let cvFilesRemoved = 0;
  let removeAttempted = false;
  try {
    const paths = await listCvFiles(admin, userId);
    for (let i = 0; i < paths.length; i += removeBatchSize) {
      removeAttempted = true;
      const { data, error } = await admin.storage.from(cvBucket).remove(paths.slice(i, i + removeBatchSize));
      if (error) throw new StepError("remove the CV files", error);
      cvFilesRemoved += data.length;
    }
    // remove() skips a path it cannot delete without saying so, so check that nothing is left.
    if ((await listCvFiles(admin, userId)).length > 0) throw new StepError("remove the CV files", { code: "files-left" });
  } catch (error) {
    failed(error);
    return { ok: false, reason: "failed", step: "files", cvFilesRemoved, removeAttempted };
  }

  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    // Already gone, as when the same deletion finished a moment earlier in another tab: deleted either way.
    if (error && error.code !== "user_not_found") throw new StepError("delete the account", error);
  } catch (error) {
    failed(error);
    return { ok: false, reason: "failed", step: "account", cvFilesRemoved, removeAttempted };
  }

  return { ok: true, summary };
}

async function getReaders(): Promise<Readers | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const own = await createSupabaseServerClient();
  return own ? { own, admin } : null;
}

function readerFor(readers: Readers, table: UserTable): SupabaseClient {
  return serverOnlyTables.includes(table) ? readers.admin : readers.own;
}

async function summarise(readers: Readers, userId: string): Promise<DataSummary> {
  const counts = await Promise.all(userTables.map((table) => countRows(readerFor(readers, table), table, userId)));
  const rows = Object.fromEntries(userTables.map((table, i) => [table, counts[i]])) as Record<UserTable, number>;
  return { rows, cvFiles: (await listCvFiles(readers.admin, userId)).length };
}

async function countRows(client: SupabaseClient, table: UserTable, userId: string): Promise<number> {
  // head: true counts without sending any row back.
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new StepError(`count ${table}`, error);
  return count ?? 0;
}

async function readRows(client: SupabaseClient, table: UserTable, userId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new StepError(`read ${table}`, error);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

/**
 * The account's details from Supabase Auth, picked one by one so nothing new slips in unseen. Supabase never
 * returns the password hash or sign-in tokens here. The IP address and browser of each session are kept in a table
 * the API does not offer, so data.json says they are not included.
 */
function accountDetails(user: User) {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone || null,
    created_at: user.created_at,
    updated_at: user.updated_at ?? null,
    confirmation_sent_at: user.confirmation_sent_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    recovery_sent_at: user.recovery_sent_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    sign_in_methods: (user.identities ?? []).map((identity) => ({
      provider: identity.provider,
      created_at: identity.created_at ?? null,
      last_sign_in_at: identity.last_sign_in_at ?? null,
    })),
    user_metadata: user.user_metadata ?? {},
  };
}

/** Every file under cvs/<user id>/, in folders at any depth, page by page. Paths are "<user id>/...". */
async function listCvFiles(admin: SupabaseClient, userId: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [userId];
  for (let folder = folders.shift(); folder !== undefined; folder = folders.shift()) {
    for (let offset = 0; ; offset += listPageSize) {
      const { data, error } = await admin.storage
        .from(cvBucket)
        .list(folder, { limit: listPageSize, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new StepError("list the CV files", error);
      // A folder comes back with id null; a file always has an id.
      for (const item of data) (item.id === null ? folders : files).push(`${folder}/${item.name}`);
      if (data.length < listPageSize) break;
    }
  }
  return files;
}

async function download(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(cvBucket).download(path);
  if (error) throw new StepError("download a CV file", error);
  return new Uint8Array(await data.arrayBuffer());
}

function countsOf(tables: Record<UserTable, unknown[]>): Record<UserTable, number> {
  return Object.fromEntries(userTables.map((table) => [table, tables[table].length])) as Record<UserTable, number>;
}

/** A Storage path as a safe path inside the ZIP: no empty, "." or ".." parts, no backslashes. */
function archivePath(path: string): string {
  return path
    .split("/")
    .map((part) => (part === "" || part === "." || part === ".." ? "_" : part.replaceAll("\\", "_")))
    .join("/");
}

class StepError extends Error {
  constructor(
    readonly step: string,
    readonly failure: { code?: unknown; statusCode?: unknown; status?: unknown },
  ) {
    super(step);
  }
}

function failed(error: unknown): Failure {
  // The step and an error code only: never a message, which can hold a file path with the user id in it.
  if (error instanceof StepError) {
    const { code, statusCode, status } = error.failure;
    console.error(`account: could not ${error.step} (${String(code ?? statusCode ?? status ?? "unknown")})`);
  } else {
    console.error(`account: unexpected ${error instanceof Error ? error.name : "error"}`);
  }
  return { ok: false, reason: "failed" };
}
