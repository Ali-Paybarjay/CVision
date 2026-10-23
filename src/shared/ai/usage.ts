import "server-only";
import { getSupabaseAdmin } from "@/shared/supabase/admin";

/** Who a model request is for: a signed-in user, or an anonymous visitor (the free CV check). */
export type Requester = { userId: string } | { anonymousKey: string };

/** Daily limits on real model requests. Change them on Vercel without a code change. */
export function getDailyLimits() {
  return {
    perUser: Number(process.env.AI_DAILY_LIMIT_PER_USER ?? 40),
    perAnonymousVisitor: Number(process.env.AI_DAILY_LIMIT_PER_ANONYMOUS ?? 3),
    allAnonymous: Number(process.env.AI_DAILY_LIMIT_ALL_ANONYMOUS ?? 300),
  };
}

export type UsageRecord = {
  requester?: Requester;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
};

/** What one request to the model used, as askModel's onUsage reports it. Thinking tokens are part of outputTokens. */
export type ModelUsage = Omit<UsageRecord, "requester" | "feature">;

type CountFilter = { userId: string } | { anonymousKey: string } | { allAnonymous: true };

export interface UsageStore {
  countToday(filter: CountFilter): Promise<number>;
  record(entry: UsageRecord): Promise<void>;
}

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** In-memory store for local development before Supabase is connected. Resets on restart. */
export function createMemoryUsageStore(): UsageStore {
  const rows: Array<UsageRecord & { at: string }> = [];
  return {
    async countToday(filter) {
      const since = startOfTodayUtc();
      return rows.filter((row) => {
        if (row.at < since) return false;
        const who = row.requester;
        if ("userId" in filter) return who !== undefined && "userId" in who && who.userId === filter.userId;
        if ("anonymousKey" in filter) return who !== undefined && "anonymousKey" in who && who.anonymousKey === filter.anonymousKey;
        return who === undefined || "anonymousKey" in who;
      }).length;
    },
    async record(entry) {
      rows.push({ ...entry, at: new Date().toISOString() });
    },
  };
}

function createSupabaseUsageStore(): UsageStore | null {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  return {
    async countToday(filter) {
      let query = admin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", startOfTodayUtc());
      if ("userId" in filter) query = query.eq("user_id", filter.userId);
      else if ("anonymousKey" in filter) query = query.eq("anonymous_key", filter.anonymousKey);
      else query = query.is("user_id", null);
      const { count, error, status } = await query;
      if (error) throw new UsageLogError("count", error, status);
      return count ?? 0;
    },
    async record(entry) {
      const who = entry.requester;
      const { error, status } = await admin.from("ai_usage").insert({
        user_id: who && "userId" in who ? who.userId : null,
        anonymous_key: who && "anonymousKey" in who ? who.anonymousKey : null,
        feature: entry.feature,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        cost_usd: entry.costUsd,
        ok: entry.ok,
      });
      if (error) throw new UsageLogError("insert", error, status);
    },
  };
}

let store: UsageStore | undefined;

/**
 * The shared usage log in Supabase, or an in-memory one for local development.
 * On Vercel each instance has its own memory, so limits would not hold: there it refuses instead.
 */
export function getUsageStore(): UsageStore {
  if (store) return store;

  const shared = createSupabaseUsageStore();
  if (!shared && process.env.VERCEL) {
    throw new Error("SUPABASE_SECRET_KEY must be set on Vercel: daily limits need the shared usage log.");
  }
  store = shared ?? createMemoryUsageStore();
  return store;
}

/**
 * Throws a LimitReachedError when the requester has used up today's requests.
 * Requests with no requester count towards the shared anonymous limit.
 */
export async function assertWithinDailyLimit(requester: Requester | undefined, usage: UsageStore = getUsageStore()) {
  const limits = getDailyLimits();

  if (requester && "userId" in requester) {
    if ((await usage.countToday({ userId: requester.userId })) >= limits.perUser) {
      throw new LimitReachedError("You have reached today's limit. Try again tomorrow.");
    }
    return;
  }

  if (requester && (await usage.countToday({ anonymousKey: requester.anonymousKey })) >= limits.perAnonymousVisitor) {
    throw new LimitReachedError("You have used today's free checks. Create a free account to keep going.");
  }
  if ((await usage.countToday({ allAnonymous: true })) >= limits.allAnonymous) {
    throw new LimitReachedError("The free check is busy today. Create a free account to keep going.");
  }
}

export class LimitReachedError extends Error {
  readonly reason = "limit-reached";
  constructor(message: string) {
    super(message);
    this.name = "LimitReachedError";
  }
}

/**
 * supabase-js hands back failures as plain objects, with an empty message on HEAD requests,
 * so logs that print only the error's name said "unknown". `details` stays out: it can hold row values.
 */
export class UsageLogError extends Error {
  constructor(action: "count" | "insert", error: { message?: string; code?: string }, status: number) {
    const reason = [error.code, error.message].filter(Boolean).join(" ");
    super(`ai_usage ${action} failed: HTTP ${status}${reason ? `, ${reason}` : ""}`);
    this.name = "UsageLogError";
  }
}

// US dollars per million tokens (prompts up to 100K tokens). Approximate: for tracking, not billing.
const pricesPerMillion: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Approximate cost of one request. Thinking tokens are part of output_tokens. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const price = pricesPerMillion[model] ?? pricesPerMillion["claude-sonnet-5-5"];
  const input =
    usage.input_tokens + 1.25 * (usage.cache_creation_input_tokens ?? 0) + 0.1 * (usage.cache_read_input_tokens ?? 0);
  return (input * price.input + usage.output_tokens * price.output) / 1_000_000;
}
