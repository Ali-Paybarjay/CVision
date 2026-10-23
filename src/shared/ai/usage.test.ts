import { afterEach, describe, expect, it, vi } from "vitest";
import { hashVisitor } from "./anonymous-key";
import { assertWithinDailyLimit, createMemoryUsageStore, estimateCostUsd, LimitReachedError } from "./usage";

afterEach(() => {
  vi.unstubAllEnvs();
});

const use = (store: ReturnType<typeof createMemoryUsageStore>, requester?: Parameters<typeof assertWithinDailyLimit>[0]) =>
  store.record({ requester, feature: "test", model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1, costUsd: 0, ok: true });

describe("daily limits", () => {
  it("stops a signed-in user at their daily limit", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "2");
    const store = createMemoryUsageStore();
    const sara = { userId: "sara" };

    await use(store, sara);
    await expect(assertWithinDailyLimit(sara, store)).resolves.toBeUndefined();
    await use(store, sara);
    await expect(assertWithinDailyLimit(sara, store)).rejects.toBeInstanceOf(LimitReachedError);
    await expect(assertWithinDailyLimit({ userId: "reza" }, store)).resolves.toBeUndefined();
  });

  it("gives each anonymous visitor their own small limit", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_ANONYMOUS", "1");
    const store = createMemoryUsageStore();

    await use(store, { anonymousKey: "a" });
    await expect(assertWithinDailyLimit({ anonymousKey: "a" }, store)).rejects.toThrow("free checks");
    await expect(assertWithinDailyLimit({ anonymousKey: "b" }, store)).resolves.toBeUndefined();
  });

  it("caps all anonymous use together, including requests with no requester", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_ALL_ANONYMOUS", "2");
    const store = createMemoryUsageStore();

    await use(store, { anonymousKey: "a" });
    await use(store);
    await expect(assertWithinDailyLimit({ anonymousKey: "c" }, store)).rejects.toThrow("busy today");
    await expect(assertWithinDailyLimit({ userId: "sara" }, store)).resolves.toBeUndefined();
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
