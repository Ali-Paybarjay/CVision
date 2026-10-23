import { afterEach, describe, expect, it, vi } from "vitest";
import { hashVisitor } from "./anonymous-key";
import {
  createMemoryUsageStore,
  estimateCostUsd,
  LimitReachedError,
  type Requester,
  reserveWithinDailyLimit,
  startOfUtcDay,
  type UsageStore,
} from "./usage";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const use = (store: UsageStore, requester?: Requester) =>
  reserveWithinDailyLimit({ requester, feature: "test", model: "claude-haiku-5-5" }, store);

/** The start of today, UTC. */
const today = () => startOfUtcDay(new Date());

/** Waits a number of turns of the event loop: a delay that does not depend on the clock, so tests run the same every time. */
async function turns(count: number) {
  for (let turn = 0; turn < count; turn++) await new Promise((resolve) => setImmediate(resolve));
}

/** The in-memory log, but every call takes one to three turns, like a round trip to Supabase. */
function withLatency(store: UsageStore): UsageStore {
  let calls = 0;
  const later = async <T>(run: () => Promise<T>) => {
    await turns(1 + (calls++ % 3));
    return run();
  };
  return {
    reserve: (request) => later(() => store.reserve(request)),
    countSince: (filter, since) => later(() => store.countSince(filter, since)),
    update: (id, used) => later(() => store.update(id, used)),
    delete: (id) => later(() => store.delete(id)),
    record: (entry) => later(() => store.record(entry)),
  };
}

describe("daily limits", () => {
  it("stops a signed-in user at their daily limit, and takes back the refused reservation", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "2");
    const store = createMemoryUsageStore();
    const sara = { userId: "sara" };

    await expect(use(store, sara)).resolves.toEqual(expect.any(Number));
    await expect(use(store, sara)).resolves.toEqual(expect.any(Number));
    await expect(use(store, sara)).rejects.toBeInstanceOf(LimitReachedError);
    await expect(store.countSince(sara, today())).resolves.toBe(2);
    await expect(use(store, { userId: "reza" })).resolves.toEqual(expect.any(Number));
  });

  it("gives each anonymous visitor their own small limit", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_ANONYMOUS", "1");
    const store = createMemoryUsageStore();

    await use(store, { anonymousKey: "a" });
    await expect(use(store, { anonymousKey: "a" })).rejects.toThrow("free checks");
    await expect(use(store, { anonymousKey: "b" })).resolves.toEqual(expect.any(Number));
  });

  it("caps all anonymous use together, including requests with no requester", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_ALL_ANONYMOUS", "2");
    const store = createMemoryUsageStore();

    await use(store, { anonymousKey: "a" });
    await use(store);
    await expect(use(store, { anonymousKey: "c" })).rejects.toThrow("busy today");
    await expect(use(store, { userId: "sara" })).resolves.toEqual(expect.any(Number));
  });

  it("holds both anonymous limits when many requests arrive at once", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_ANONYMOUS", "2");
    vi.stubEnv("AI_DAILY_LIMIT_ALL_ANONYMOUS", "3");
    const store = withLatency(createMemoryUsageStore());
    const visitors = Array.from({ length: 16 }, (_, index) => ({ anonymousKey: "abcd"[index % 4] }));

    // They arrive a moment apart, each while others are still being counted.
    const results = await Promise.allSettled(
      visitors.map(async (visitor, index) => {
        await turns(index);
        return use(store, visitor);
      }),
    );

    const allowed = visitors.filter((_, index) => results[index].status === "fulfilled");
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.length).toBeLessThanOrEqual(3);
    for (const key of ["a", "b", "c", "d"]) {
      expect(allowed.filter((visitor) => visitor.anonymousKey === key).length).toBeLessThanOrEqual(2);
    }
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(LimitReachedError);
    }
    // The refused reservations are gone: only the requests let through are counted.
    await expect(store.countSince({ allAnonymous: true }, today())).resolves.toBe(allowed.length);
  });

  it("takes back the reservation when today's count fails, and passes the failure on", async () => {
    const store = createMemoryUsageStore();
    const failure = new Error("count failed");
    vi.spyOn(store, "countSince").mockRejectedValueOnce(failure);

    await expect(use(store, { userId: "sara" })).rejects.toBe(failure);
    await expect(store.countSince({ userId: "sara" }, today())).resolves.toBe(0);
  });

  it("still turns the request away when its reservation cannot be taken back, and logs why", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "0");
    const store = createMemoryUsageStore();
    const failure = new Error("delete failed");
    vi.spyOn(store, "delete").mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(use(store, { userId: "sara" })).rejects.toBeInstanceOf(LimitReachedError);
    expect(consoleError).toHaveBeenCalledWith("askModel: could not remove an unused usage reservation", failure);
  });
});

describe("daily limits at midnight UTC", () => {
  const sara = { userId: "sara" };
  const lastMoment = new Date("2026-10-22T23:59:59.950Z");
  const justAfterMidnight = new Date("2026-10-23T00:00:00.050Z");

  /** The in-memory log, but midnight passes between saving each reservation and counting. */
  function midnightAfterReserving(store: UsageStore): UsageStore {
    return {
      ...store,
      async reserve(request) {
        const reserved = await store.reserve(request);
        vi.setSystemTime(justAfterMidnight);
        return reserved;
      },
    };
  }

  it("counts a request with the day its row was saved on, even when the count runs after midnight", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "1");
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = createMemoryUsageStore();

    vi.setSystemTime(new Date("2026-10-22T23:59:58.000Z"));
    await expect(use(store, sara)).resolves.toEqual(expect.any(Number));

    // Five more arrive together and are saved just before midnight, but counted just after it.
    vi.setSystemTime(lastMoment);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => use(midnightAfterReserving(store), sara)));

    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(LimitReachedError);
    }
    // Only the first request is left, on its own day; the new day starts empty.
    await expect(store.countSince(sara, "2026-10-22T00:00:00.000Z")).resolves.toBe(1);
    await expect(store.countSince(sara, "2026-10-23T00:00:00.000Z")).resolves.toBe(0);
    await expect(use(store, sara)).resolves.toEqual(expect.any(Number));
  });

  it("holds the limit on each side of midnight when many requests arrive at once", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "3");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(lastMoment);
    const memory = createMemoryUsageStore();
    // Midnight passes once the sixth reservation is saved, while earlier requests are still being counted.
    let saved = 0;
    const store = withLatency({
      ...memory,
      async reserve(request) {
        const reserved = await memory.reserve(request);
        if (++saved === 6) vi.setSystemTime(justAfterMidnight);
        return reserved;
      },
    });

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, async (_, index) => {
        await turns(index);
        return use(store, sara);
      }),
    );

    const allowed = results.filter((result) => result.status === "fulfilled").length;
    expect(allowed).toBeGreaterThan(0);
    // The refused reservations are gone, so every row left is a request let through, on the day it was saved.
    const sinceYesterday = await memory.countSince(sara, "2026-10-22T00:00:00.000Z");
    const sinceToday = await memory.countSince(sara, "2026-10-23T00:00:00.000Z");
    expect(sinceYesterday).toBe(allowed);
    expect(sinceYesterday - sinceToday).toBeLessThanOrEqual(3);
    expect(sinceToday).toBeLessThanOrEqual(3);
  });
});

describe("the in-memory usage log", () => {
  it("fills in, removes and adds rows", async () => {
    const store = createMemoryUsageStore();
    const sara = { userId: "sara" };

    const first = await store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" });
    const second = await store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" });
    expect(second.id).not.toBe(first.id);
    await store.update(first.id, { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200, costUsd: 0.0002, ok: true });
    await store.delete(second.id);
    await store.record({ requester: sara, feature: "test", model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1, costUsd: 0, ok: true });

    await expect(store.countSince(sara, today())).resolves.toBe(2);
  });

  it("says when a reserved row was saved, and counts only rows saved since a given time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = createMemoryUsageStore();
    const sara = { userId: "sara" };

    vi.setSystemTime(new Date("2026-10-22T23:59:59.950Z"));
    await expect(store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" })).resolves.toEqual({
      id: expect.any(Number),
      createdAt: "2026-10-22T23:59:59.950Z",
    });
    vi.setSystemTime(new Date("2026-10-23T00:00:00.050Z"));
    await store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" });

    await expect(store.countSince(sara, "2026-10-22T00:00:00.000Z")).resolves.toBe(2);
    await expect(store.countSince(sara, "2026-10-23T00:00:00.000Z")).resolves.toBe(1);
  });
});

describe("startOfUtcDay", () => {
  it("finds the UTC day of a timestamp from Postgres, whatever its offset", () => {
    expect(startOfUtcDay("2026-10-22T23:59:59.999999+00:00")).toBe("2026-10-22T00:00:00.000Z");
    expect(startOfUtcDay("2026-10-23T00:30:00.123456+01:00")).toBe("2026-10-22T00:00:00.000Z");
    expect(startOfUtcDay(new Date("2026-10-23T00:00:00.000Z"))).toBe("2026-10-23T00:00:00.000Z");
  });
});

describe("estimateCostUsd", () => {
  it("prices a typical Haiku tailoring request at under half a cent", () => {
    const cost = estimateCostUsd("claude-haiku-5-5", { input_tokens: 16_000, output_tokens: 5_500 });
    expect(cost).toBeCloseTo(0.00435, 5);
  });
});

describe("hashVisitor", () => {
  it("never contains the IP address and changes every day", () => {
    const today = hashVisitor("203.0.113.7", new Date("2026-10-21"));
    expect(today).not.toContain("203.0.113.7");
    expect(hashVisitor("203.0.113.7", new Date("2026-10-21"))).toBe(today);
    expect(hashVisitor("203.0.113.7", new Date("2026-10-22"))).not.toBe(today);
  });

  it("refuses to run on Vercel without a secret salt", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ANONYMOUS_KEY_SALT", "");
    expect(() => hashVisitor("203.0.113.7", new Date("2026-10-21"))).toThrow("ANONYMOUS_KEY_SALT");
  });
});

describe("getUsageStore", () => {
  it("refuses to fall back to memory on Vercel", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const { getUsageStore } = await import("./usage");
    expect(() => getUsageStore()).toThrow("SUPABASE_SECRET_KEY");
  });

  it("uses memory for local development", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const { getUsageStore } = await import("./usage");
    await expect(getUsageStore().countSince({ userId: "sara" }, today())).resolves.toBe(0);
  });
});

describe("the Supabase usage log", () => {
  /** A stand-in for the admin client: it notes each call in a query chain and answers with `answer`. */
  const fakeSupabase = () => {
    const calls: unknown[][] = [];
    let answer: object = {};
    const query: Record<string, unknown> = {
      then: (resolve: (value: object) => void) => resolve(answer),
    };
    for (const method of ["insert", "select", "single", "update", "delete", "eq", "gte", "is"]) {
      query[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return query;
      };
    }
    return {
      calls,
      /** Sets what the next queries return, and forgets the calls so far. */
      answerWith(next: object) {
        answer = next;
        calls.length = 0;
      },
      admin: {
        from: (table: string) => {
          calls.push(["from", table]);
          return query;
        },
      },
    };
  };

  const storeOn = async (supabase: ReturnType<typeof fakeSupabase>) => {
    vi.resetModules();
    vi.doMock("@/shared/supabase/admin", () => ({ getSupabaseAdmin: () => supabase.admin }));
    const usage = await import("./usage");
    return { store: usage.getUsageStore(), UsageLogError: usage.UsageLogError };
  };

  const sara = { userId: "sara" };
  const used = { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200, costUsd: 0.0002, ok: true };
  // supabase-js returns failures as plain objects; `details` can hold row values.
  const refused = {
    data: null,
    error: { message: "permission denied for table ai_usage", code: "42501", details: "Failing row contains (sara)" },
    status: 403,
  };

  afterEach(() => {
    vi.doUnmock("@/shared/supabase/admin");
  });

  it("reserves a row with nothing used yet, and returns its id and when the database saved it", async () => {
    const supabase = fakeSupabase();
    const { store } = await storeOn(supabase);

    supabase.answerWith({ data: { id: 41, created_at: "2026-10-23T09:30:00.123456+00:00" }, error: null, status: 201 });
    await expect(store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" })).resolves.toEqual({
      id: 41,
      createdAt: "2026-10-23T09:30:00.123456+00:00",
    });
    expect(supabase.calls).toEqual([
      ["from", "ai_usage"],
      [
        "insert",
        {
          user_id: "sara",
          anonymous_key: null,
          feature: "test",
          model: "claude-haiku-5-5",
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          ok: false,
        },
      ],
      ["select", "id, created_at"],
      ["single"],
    ]);
  });

  it("counts the rows saved since a given time without fetching them", async () => {
    const supabase = fakeSupabase();
    const { store } = await storeOn(supabase);

    supabase.answerWith({ count: 2, error: null, status: 200 });
    await expect(store.countSince({ anonymousKey: "a" }, "2026-10-23T00:00:00.000Z")).resolves.toBe(2);
    expect(supabase.calls).toEqual([
      ["from", "ai_usage"],
      ["select", "id", { count: "exact", head: true }],
      ["gte", "created_at", "2026-10-23T00:00:00.000Z"],
      ["eq", "anonymous_key", "a"],
    ]);

    supabase.answerWith({ count: 5, error: null, status: 200 });
    await expect(store.countSince({ allAnonymous: true }, "2026-10-23T00:00:00.000Z")).resolves.toBe(5);
    expect(supabase.calls.at(-1)).toEqual(["is", "user_id", null]);
  });

  it("counts from the start of the day the database saved the reservation on, not this server's day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // This server is already past midnight; the database saved the row just before it.
    vi.setSystemTime(new Date("2026-10-23T00:00:00.050Z"));
    const supabase = fakeSupabase();
    const { store } = await storeOn(supabase);

    supabase.answerWith({ data: { id: 41, created_at: "2026-10-22T23:59:59.95+00:00" }, count: 1, error: null, status: 201 });
    await expect(reserveWithinDailyLimit({ requester: sara, feature: "test", model: "claude-haiku-5-5" }, store)).resolves.toBe(41);
    expect(supabase.calls).toContainEqual(["gte", "created_at", "2026-10-22T00:00:00.000Z"]);
  });

  it("fills in and removes a reserved row by its id", async () => {
    const supabase = fakeSupabase();
    const { store } = await storeOn(supabase);

    supabase.answerWith({ error: null, status: 204 });
    await store.update(41, used);
    expect(supabase.calls).toEqual([
      ["from", "ai_usage"],
      ["update", { model: "claude-haiku-5-5", input_tokens: 1000, output_tokens: 200, cost_usd: 0.0002, ok: true }],
      ["eq", "id", 41],
    ]);

    supabase.answerWith({ error: null, status: 204 });
    await store.delete(41);
    expect(supabase.calls).toEqual([["from", "ai_usage"], ["delete"], ["eq", "id", 41]]);
  });

  it("adds a row of its own for a retry", async () => {
    const supabase = fakeSupabase();
    const { store } = await storeOn(supabase);

    supabase.answerWith({ error: null, status: 201 });
    await store.record({ requester: sara, feature: "test", ...used });
    expect(supabase.calls).toEqual([
      ["from", "ai_usage"],
      [
        "insert",
        {
          user_id: "sara",
          anonymous_key: null,
          feature: "test",
          model: "claude-haiku-5-5",
          input_tokens: 1000,
          output_tokens: 200,
          cost_usd: 0.0002,
          ok: true,
        },
      ],
    ]);
  });

  it("turns failures into errors that say what failed, without row details", async () => {
    const supabase = fakeSupabase();
    const { store, UsageLogError } = await storeOn(supabase);

    // A HEAD count that is refused has an empty message.
    supabase.answerWith({ count: null, error: { message: "" }, status: 401 });
    const counted = store.countSince({ userId: "sara" }, "2026-10-23T00:00:00.000Z");
    await expect(counted).rejects.toBeInstanceOf(UsageLogError);
    await expect(counted).rejects.toThrow("ai_usage count failed: HTTP 401");

    supabase.answerWith(refused);
    const failures: Array<[string, Promise<unknown>]> = [
      ["insert", store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" })],
      ["insert", store.record({ requester: sara, feature: "test", ...used })],
      ["update", store.update(41, used)],
      ["delete", store.delete(41)],
    ];
    for (const [action, failed] of failures) {
      await expect(failed).rejects.toThrow(`ai_usage ${action} failed: HTTP 403, 42501 permission denied for table ai_usage`);
      await expect(failed).rejects.not.toThrow("Failing row");
    }
  });
});
