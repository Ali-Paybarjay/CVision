import { afterEach, describe, expect, it, vi } from "vitest";
import { hashVisitor } from "./anonymous-key";
import {
  createMemoryUsageStore,
  estimateCostUsd,
  LimitReachedError,
  type Requester,
  reserveWithinDailyLimit,
  type UsageStore,
} from "./usage";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const use = (store: UsageStore, requester?: Requester) =>
  reserveWithinDailyLimit({ requester, feature: "test", model: "claude-haiku-5-5" }, store);

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
    countToday: (filter) => later(() => store.countToday(filter)),
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
    await expect(store.countToday(sara)).resolves.toBe(2);
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
    await expect(store.countToday({ allAnonymous: true })).resolves.toBe(allowed.length);
  });

  it("takes back the reservation when today's count fails, and passes the failure on", async () => {
    const store = createMemoryUsageStore();
    const failure = new Error("count failed");
    vi.spyOn(store, "countToday").mockRejectedValueOnce(failure);

    await expect(use(store, { userId: "sara" })).rejects.toBe(failure);
    await expect(store.countToday({ userId: "sara" })).resolves.toBe(0);
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

describe("the in-memory usage log", () => {
  it("fills in, removes and adds rows", async () => {
    const store = createMemoryUsageStore();
    const sara = { userId: "sara" };

    const first = await store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" });
    const second = await store.reserve({ requester: sara, feature: "test", model: "claude-haiku-5-5" });
    expect(second).not.toBe(first);
    await store.update(first, { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200, costUsd: 0.0002, ok: true });
    await store.delete(second);
    await store.record({ requester: sara, feature: "test", model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1, costUsd: 0, ok: true });

    await expect(store.countToday(sara)).resolves.toBe(2);
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
    await expect(getUsageStore().countToday({ userId: "sara" })).resolves.toBe(0);
  });
});

describe("Supabase usage log failures", () => {
  // supabase-js returns failures as plain objects; a HEAD count that is refused has an empty message.
  const failingSupabase = () => {
    const count = { count: null, error: { message: "" }, status: 401 };
    const query = { gte: () => query, eq: () => query, is: () => query, then: (resolve: (value: object) => void) => resolve(count) };
    const insert = async () => ({
      error: { message: "permission denied for table ai_usage", code: "42501", details: "Failing row contains (sara)" },
      status: 403,
    });
    return { from: () => ({ select: () => query, insert }) };
  };

  afterEach(() => {
    vi.doUnmock("@/shared/supabase/admin");
  });

  it("turns them into errors that say what failed, without row details", async () => {
    vi.resetModules();
    vi.doMock("@/shared/supabase/admin", () => ({ getSupabaseAdmin: failingSupabase }));
    const { getUsageStore, UsageLogError } = await import("./usage");
    const store = getUsageStore();

    const counted = store.countToday({ userId: "sara" });
    await expect(counted).rejects.toBeInstanceOf(UsageLogError);
    await expect(counted).rejects.toThrow("ai_usage count failed: HTTP 401");

    const recorded = store.record({ feature: "test", model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1, costUsd: 0, ok: true });
    await expect(recorded).rejects.toThrow("ai_usage insert failed: HTTP 403, 42501 permission denied for table ai_usage");
    await expect(recorded).rejects.not.toThrow("Failing row");
  });
});
