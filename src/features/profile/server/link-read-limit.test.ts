import { afterEach, describe, expect, it, vi } from "vitest";
import { getUsageStore, startOfUtcDay } from "@/shared/ai/usage";
import { getLinkReadDailyLimit, LINK_READ_FEATURE, reserveLinkRead, settleLinkRead } from "./link-read-limit";

// A visitor's key comes from the request's headers; here it is fixed.
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor-1" }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Without Supabase the usage log is the in-memory one, shared by every test here: each test has its own person.
const linkReads = (requester: { userId: string } | { anonymousKey: string }) =>
  getUsageStore().countSince({ ...requester, feature: LINK_READ_FEATURE }, startOfUtcDay(new Date()));

describe("getLinkReadDailyLimit", () => {
  it("is 30 a day unless Vercel sets another whole number", () => {
    expect(getLinkReadDailyLimit()).toBe(30);
    vi.stubEnv("LINK_READ_DAILY_LIMIT", "5");
    expect(getLinkReadDailyLimit()).toBe(5);
    vi.stubEnv("LINK_READ_DAILY_LIMIT", "0");
    expect(getLinkReadDailyLimit()).toBe(0);
    // A typo never switches the limit off.
    for (const typo of ["", "  ", "thirty", "-1", "2.5"]) {
      vi.stubEnv("LINK_READ_DAILY_LIMIT", typo);
      expect(getLinkReadDailyLimit()).toBe(30);
    }
  });
});

describe("reserveLinkRead", () => {
  it("lets a person open pages from links until the day's limit, then says so (#391)", async () => {
    vi.stubEnv("LINK_READ_DAILY_LIMIT", "2");
    const sara = { userId: "limit-sara" };

    await expect(reserveLinkRead(sara)).resolves.toEqual({ ok: true, id: expect.any(Number) });
    await expect(reserveLinkRead(sara)).resolves.toEqual({ ok: true, id: expect.any(Number) });
    await expect(reserveLinkRead(sara)).resolves.toEqual({ ok: false, reason: "limit" });
    await expect(linkReads(sara)).resolves.toBe(2);
    await expect(reserveLinkRead({ userId: "limit-reza" })).resolves.toMatchObject({ ok: true });
  });

  it("counts a signed-out visitor in the demo against the day's visitor key", async () => {
    await reserveLinkRead(undefined);

    await expect(linkReads({ anonymousKey: "visitor-1" })).resolves.toBe(1);
  });

  it("opens nothing when the day's reads can't be counted, and logs why", async () => {
    const failure = new Error("count failed");
    vi.spyOn(getUsageStore(), "countSince").mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reserveLinkRead({ userId: "limit-emma" })).resolves.toEqual({ ok: false, reason: "limit-error" });
    expect(consoleError).toHaveBeenCalledWith("jobs: could not count today's link reads", failure);
    await expect(linkReads({ userId: "limit-emma" })).resolves.toBe(0);
  });
});

describe("settleLinkRead", () => {
  it("notes whether the page was read, with no model and nothing spent", async () => {
    const update = vi.spyOn(getUsageStore(), "update");

    await settleLinkRead(7, false);

    expect(update).toHaveBeenCalledWith(7, { model: "none", inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false });
  });

  it("only logs when it can't", async () => {
    const failure = new Error("update failed");
    vi.spyOn(getUsageStore(), "update").mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(settleLinkRead(7, true)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("jobs: could not note a link read", failure);
  });
});
