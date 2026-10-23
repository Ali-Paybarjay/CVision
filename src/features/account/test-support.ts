// Test helpers for the data-rights code (issue #43): a fake Supabase admin client and a ZIP reader.
// Used only by tests; nothing in the app imports this file.
import { crc32 } from "./zip";

type Row = Record<string, unknown>;

/**
 * What the fake client holds: rows by table, the cvs bucket's files by path ("<user id>/cv.pdf"), and Supabase Auth
 * users by id (a user missing here is not found).
 */
export type FakeData = { tables: Record<string, Row[]>; files: Map<string, Uint8Array>; users?: Record<string, Row> };

/**
 * Calls the fake can be made to fail, e.g. "count:jobs", "read:events", "list", "download", "remove", "getUserById",
 * "deleteUser", or "deleteUser:not-found" (the user is already gone).
 */
export type FakeFailure =
  | `count:${string}`
  | `read:${string}`
  | "list"
  | "download"
  | "remove"
  | "getUserById"
  | "deleteUser"
  | "deleteUser:not-found";

export type FakeAdminOptions = {
  fail?: FakeFailure[];
  /** remove() reports success but deletes only this many files per call, as when Storage skips a path. */
  removeAtMost?: number;
};

/**
 * Just enough of a Supabase client for data-rights.ts, as the admin client (secret key) or as the user's own:
 * filtered reads with counts and pages, Storage list (one folder level per call, with folders as id null, like the
 * real list()), download and remove, and auth.admin.getUserById and deleteUser. Deleting a user deletes their rows
 * in every table, like on delete cascade. calls.from records each table read, to check which client read what.
 */
export function fakeAdmin(data: FakeData, options: FakeAdminOptions = {}) {
  const fails = (what: FakeFailure) => options.fail?.includes(what) ?? false;
  const calls = {
    from: [] as string[],
    deleteUser: [] as string[],
    removed: [] as string[][],
    listed: [] as string[],
    downloaded: [] as string[],
  };

  const client = {
    from(table: string) {
      calls.from.push(table);
      const filters: [string, unknown][] = [];
      let countOnly = false;
      let range: [number, number] | null = null;
      let orderBy: string | null = null;

      const run = () => {
        if (fails(countOnly ? `count:${table}` : `read:${table}`)) return { data: null, count: null, error: { code: "57014" } };
        let rows = (data.tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
        if (orderBy) {
          const column = orderBy;
          rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
        }
        if (countOnly) return { data: null, count: rows.length, error: null };
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return { data: rows.map((row) => ({ ...row })), count: null, error: null };
      };

      const query = {
        select: (_columns: string, select?: { count?: string; head?: boolean }) => {
          countOnly = select?.count === "exact" && select.head === true;
          return query;
        },
        eq: (column: string, value: unknown) => (filters.push([column, value]), query),
        order: (column: string) => ((orderBy = column), query),
        range: (from: number, to: number) => ((range = [from, to]), query),
        then: <T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (reason: unknown) => T) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },

    storage: {
      from(bucket: string) {
        if (bucket !== "cvs") throw new Error(`fakeAdmin: unexpected bucket ${bucket}`);
        return {
          async list(path: string, { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}) {
            calls.listed.push(path);
            if (fails("list")) return { data: null, error: { name: "StorageApiError", statusCode: "500" } };
            const prefix = `${path}/`;
            const children = new Map<string, boolean>();
            for (const key of data.files.keys()) {
              if (!key.startsWith(prefix)) continue;
              const [name, ...rest] = key.slice(prefix.length).split("/");
              children.set(name, (children.get(name) ?? false) || rest.length > 0);
            }
            const page = [...children].sort(([a], [b]) => a.localeCompare(b)).slice(offset, offset + limit);
            return {
              data: page.map(([name, isFolder]) =>
                isFolder ? { name, id: null, metadata: null } : { name, id: `id:${prefix}${name}`, metadata: { size: data.files.get(prefix + name)?.length } },
              ),
              error: null,
            };
          },
          async download(path: string) {
            calls.downloaded.push(path);
            const file = data.files.get(path);
            if (fails("download") || !file) return { data: null, error: { name: "StorageApiError", statusCode: "404" } };
            return { data: new Blob([file.slice()]), error: null };
          },
          async remove(paths: string[]) {
            calls.removed.push(paths);
            if (fails("remove")) return { data: null, error: { name: "StorageApiError", statusCode: "500" } };
            const removed = paths.filter((path) => data.files.has(path)).slice(0, options.removeAtMost ?? paths.length);
            for (const path of removed) data.files.delete(path);
            return { data: removed.map((name) => ({ name })), error: null };
          },
        };
      },
    },

    auth: {
      admin: {
        async getUserById(id: string) {
          if (fails("getUserById")) return { data: { user: null }, error: { code: "unexpected_failure", status: 500 } };
          const user = data.users?.[id];
          if (!user) return { data: { user: null }, error: { code: "user_not_found", status: 404 } };
          return { data: { user: { ...user } }, error: null };
        },
        async deleteUser(id: string) {
          calls.deleteUser.push(id);
          if (fails("deleteUser")) return { data: { user: null }, error: { code: "unexpected_failure", status: 500 } };
          if (fails("deleteUser:not-found")) return { data: { user: null }, error: { code: "user_not_found", status: 404 } };
          for (const table of Object.keys(data.tables)) data.tables[table] = data.tables[table].filter((row) => row.user_id !== id);
          return { data: { user: null }, error: null };
        },
      },
    },
  };

  return { client, calls };
}

export type ZipFile = { name: string; data: Uint8Array; flags: number; method: number };

/**
 * Reads a stored (uncompressed) ZIP, checking it the way unzip does: the end record, the central directory, each
 * local header and every CRC-32. Throws on anything malformed.
 */
export function readZip(bytes: Uint8Array): ZipFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const end = bytes.length - 22;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("readZip: no end record");
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (centralOffset + centralSize !== end) throw new Error("readZip: central directory does not end at the end record");

  const files: ZipFile[] = [];
  let at = centralOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("readZip: bad central header");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`readZip: bad local header for ${name}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name || view.getUint32(localOffset + 14, true) !== crc) throw new Error(`readZip: headers disagree for ${name}`);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(start, start + size);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`readZip: bad CRC for ${name}`);

    files.push({ name, data, flags, method });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
