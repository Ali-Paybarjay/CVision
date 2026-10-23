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

/** A request about to be sent to the model, before anything is known about what it uses. */
export type UsageRequest = Pick<UsageRecord, "requester" | "feature" | "model">;

/** The id of one row in the usage log. */
export type UsageRowId = number;

/** How a reserved row starts, and what is known about a request that failed before the model answered. */
export function noUsage(model: string): ModelUsage {
  return { model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false };
}

type CountFilter = { userId: string } | { anonymousKey: string } | { allAnonymous: true };

export interface UsageStore {
  /** Adds a row for a request about to be sent, with nothing used yet, and returns its id. */
  reserve(request: UsageRequest): Promise<UsageRowId>;
  countToday(filter: CountFilter): Promise<number>;
  /** Fills in a reserved row with what its request really used. */
  update(id: UsageRowId, used: ModelUsage): Promise<void>;
  /** Removes a reserved row whose request was never sent. */
  delete(id: UsageRowId): Promise<void>;
  /** Adds a row for a request that had no reservation: a retry. */
  record(entry: UsageRecord): Promise<void>;
}

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** In-memory store for local development before Supabase is connected. Resets on restart. */
export function createMemoryUsageStore(): UsageStore {
  const rows = new Map<UsageRowId, UsageRecord & { at: string }>();
  let lastId = 0;
  const add = (entry: UsageRecord) => {
    rows.set(++lastId, { ...entry, at: new Date().toISOString() });
    return lastId;
  };
  return {
    async reserve(request) {
      return add({ ...request, ...noUsage(request.model) });
    },
    async countToday(filter) {
      const since = startOfTodayUtc();
      return [...rows.values()].filter((row) => {
        if (row.at < since) return false;
        const who = row.requester;
        if ("userId" in filter) return who !== undefined && "userId" in who && who.userId === filter.userId;
        if ("anonymousKey" in filter) return who !== undefined && "anonymousKey" in who && who.anonymousKey === filter.anonymousKey;
        return who === undefined || "anonymousKey" in who;
      }).length;
    },
    async update(id, used) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, ...used });
    },
    async delete(id) {
      rows.delete(id);
    },
    async record(entry) {
      add(entry);
    },
  };
}

function createSupabaseUsageStore(): UsageStore | null {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const insert = (entry: UsageRecord) => {
    const who = entry.requester;
    return admin.from("ai_usage").insert({
      user_id: who && "userId" in who ? who.userId : null,
      anonymous_key: who && "anonymousKey" in who ? who.anonymousKey : null,
      feature: entry.feature,
      ...usageColumns(entry),
    });
  };

  return {
    async reserve(request) {
      const { data, error, status } = await insert({ ...request, ...noUsage(request.model) }).select("id").single();
      if (error) throw new UsageLogError("insert", error, status);
      return data.id;
    },
    async countToday(filter) {
      let query = admin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", startOfTodayUtc());
      if ("userId" in filter) query = query.eq("user_id", filter.userId);
      else if ("anonymousKey" in filter) query = query.eq("anonymous_key", filter.anonymousKey);
      else query = query.is("user_id", null);
      const { count, error, status } = await query;
      if (error) throw new UsageLogError("count", error, status);
      return count ?? 0;
    },
    async update(id, used) {
      const { error, status } = await admin.from("ai_usage").update(usageColumns(used)).eq("id", id);
      if (error) throw new UsageLogError("update", error, status);
    },
    async delete(id) {
      const { error, status } = await admin.from("ai_usage").delete().eq("id", id);
      if (error) throw new UsageLogError("delete", error, status);
    },
    async record(entry) {
      const { error, status } = await insert(entry);
      if (error) throw new UsageLogError("insert", error, status);
    },
  };
}

function usageColumns(used: ModelUsage) {
  return {
    model: used.model,
    input_tokens: used.inputTokens,
    output_tokens: used.outputTokens,
    cost_usd: used.costUsd,
    ok: used.ok,
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
 * Reserves a row in the usage log for a request about to be sent, then checks today's limit with that row
 * counted, and returns its id for askModel to fill in. When the requester has used up today's requests,
 * removes the row and throws a LimitReachedError. Requests with no requester count towards the shared
 * anonymous limit.
 *
 * Reserving before counting stops requests that arrive together from all taking the last place: of the
 * requests let through, the one whose row was saved last counts every other one. That is why all of
 * today's rows are counted, not only those with a smaller id: ids are handed out before rows are saved,
 * so they do not show which came first. The cost is that rows of requests about to be turned away count
 * too, so under heavy contention the limit can stop a request a little early, but never lets one too many through.
 */
export async function reserveWithinDailyLimit(request: UsageRequest, usage: UsageStore = getUsageStore()): Promise<UsageRowId> {
  const id = await usage.reserve(request);
  let refusal: string | undefined;
  try {
    refusal = await limitReachedMessage(request.requester, usage);
  } catch (error) {
    // Without a count there is no limit, so the request will not be sent and needs no row.
    await release(usage, id);
    throw error;
  }
  if (refusal) {
    await release(usage, id);
    throw new LimitReachedError(refusal);
  }
  return id;
}

/** Today's counts include the request's own reservation, so a count may equal the limit but not pass it. */
async function limitReachedMessage(requester: Requester | undefined, usage: UsageStore): Promise<string | undefined> {
  const limits = getDailyLimits();

  if (requester && "userId" in requester) {
    if ((await usage.countToday({ userId: requester.userId })) > limits.perUser) {
      return "You have reached today's limit. Try again tomorrow.";
    }
    return undefined;
  }

  if (requester && (await usage.countToday({ anonymousKey: requester.anonymousKey })) > limits.perAnonymousVisitor) {
    return "You have used today's free checks. Create a free account to keep going.";
  }
  if ((await usage.countToday({ allAnonymous: true })) > limits.allAnonymous) {
    return "The free check is busy today. Create a free account to keep going.";
  }
  return undefined;
}

/** Removes a reservation whose request will not be sent. A row left behind only adds one to today's count, so it is logged, not thrown. */
async function release(usage: UsageStore, id: UsageRowId): Promise<void> {
  try {
    await usage.delete(id);
  } catch (error) {
    console.error("askModel: could not remove an unused usage reservation", error);
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
  constructor(action: "count" | "insert" | "update" | "delete", error: { message?: string; code?: string }, status: number) {
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
