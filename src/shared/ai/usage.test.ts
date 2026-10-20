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
});
