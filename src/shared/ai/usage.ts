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

/** One of the daily limits, by its name in getDailyLimits(). */
export type DailyLimit = keyof ReturnType<typeof getDailyLimits>;

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

/** A row reserved for a request: its id, and when the usage log saved it, by the log's own clock (an ISO timestamp). */
export type Reservation = { id: UsageRowId; createdAt: string };

/** How a reserved row starts, before anything is known about what its request uses. */
export function noUsage(model: string): ModelUsage {
  return { model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false };
}

type CountFilter = { userId: string } | { anonymousKey: string } | { allAnonymous: true };

export interface UsageStore {
  /** Adds a row for a request about to be sent, with nothing used yet, and returns its id and when it was saved. */
  reserve(request: UsageRequest): Promise<Reservation>;
  /** Counts the rows saved at or after `since`, an ISO timestamp. */
  countSince(filter: CountFilter, since: string): Promise<number>;
  /** Fills in a reserved row with what its request really used. */
  update(id: UsageRowId, used: ModelUsage): Promise<void>;
  /** Removes a reserved row whose request was turned away, or got no answer from the model. */
  delete(id: UsageRowId): Promise<void>;
  /** Adds a row for a request that had no reservation: a retry. */
  record(entry: UsageRecord): Promise<void>;
}

/** The start of the UTC day that `at` falls on, as an ISO timestamp: daily limits reset at midnight UTC. */
export function startOfUtcDay(at: string | Date): string {
  const time = new Date(at);
  return new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate())).toISOString();
}

/** In-memory store for local development before Supabase is connected. Resets on restart. */
export function createMemoryUsageStore(): UsageStore {
  const rows = new Map<UsageRowId, UsageRecord & { at: string }>();
  let lastId = 0;
  const add = (entry: UsageRecord): Reservation => {
    const at = new Date().toISOString();
    rows.set(++lastId, { ...entry, at });
    return { id: lastId, createdAt: at };
  };
  return {
    async reserve(request) {
      return add({ ...request, ...noUsage(request.model) });
    },
    async countSince(filter, since) {
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
      const { data, error, status } = await insert({ ...request, ...noUsage(request.model) }).select("id, created_at").single();
      if (error) throw new UsageLogError("insert", error, status);
      return { id: data.id, createdAt: data.created_at };
    },
    async countSince(filter, since) {
      let query = admin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", since);
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
 * Reserves a row in the usage log for a request about to be sent, then checks the limit for the day that
 * row was saved on, with the row counted, and returns its id for askModel to fill in. When the requester
 * has used up that day's requests, removes the row and throws a LimitReachedError. Requests with no
 * requester count towards the shared anonymous limit.
 *
 * Reserving before counting stops requests that arrive together from all taking the last place: of the
 * requests let through on one day, the one whose row was saved last counts every other one. That is why
 * all of the day's rows are counted, not only those with a smaller id: ids are handed out before rows are
 * saved, so they do not show which came first. The day comes from the reserved row's own time, by the usage
 * log's clock, not this server's: a row saved just before midnight UTC is counted with the rows of its own
 * day even when the count runs after midnight, and the two clocks do not need to agree.
 *
 * The cost is that rows of requests about to be turned away count too, so under heavy contention the limit
 * can stop a request a little early. What it guarantees is about requests that pass this check and keep
 * their row: never more of them on one day than the limit. A request whose call to the model fails gives
 * its place back (askModel removes its row), so a provider outage uses up nobody's requests. The guarantee
 * counts requests, not calls to the model: a retry inside askModel has no reservation of its own, so calls
 * to the model can pass the limit by one for each request let through, as before reservations.
 *
 * A row can also be left behind: if the answer to the reservation is lost on the way back, or the function
 * stops before the row is filled in or removed, the row stays and adds one to its day's count. That only
 * turns requests away early.
 */
export async function reserveWithinDailyLimit(request: UsageRequest, usage: UsageStore = getUsageStore()): Promise<UsageRowId> {
  const reserved = await usage.reserve(request);
  let refusal: Refusal | undefined;
  try {
    refusal = await reachedLimit(request.requester, usage, startOfUtcDay(reserved.createdAt));
  } catch (error) {
    // Without a count there is no limit, so the request will not be sent and needs no row.
    await releaseReservation(reserved.id, usage);
    throw error;
  }
  if (refusal) {
    await releaseReservation(reserved.id, usage);
    throw new LimitReachedError(refusal.message, refusal.limit);
  }
  return reserved.id;
}

/** Which limit turned a request away, and what the user is told. */
type Refusal = { limit: DailyLimit; message: string };

/** The day's counts include the request's own reservation, so a count may equal the limit but not pass it. */
async function reachedLimit(requester: Requester | undefined, usage: UsageStore, since: string): Promise<Refusal | undefined> {
  const limits = getDailyLimits();

  if (requester && "userId" in requester) {
    if ((await usage.countSince({ userId: requester.userId }, since)) > limits.perUser) {
      return { limit: "perUser", message: "You have reached today's limit. Try again tomorrow." };
    }
    return undefined;
  }

  if (requester && (await usage.countSince({ anonymousKey: requester.anonymousKey }, since)) > limits.perAnonymousVisitor) {
    return { limit: "perAnonymousVisitor", message: "You have used today's free checks. Create a free account to keep going." };
  }
  if ((await usage.countSince({ allAnonymous: true }, since)) > limits.allAnonymous) {
    return { limit: "allAnonymous", message: "The free check is busy today. Create a free account to keep going." };
  }
  return undefined;
}

/**
 * Gives a reserved place back: its request was turned away, or the model never answered it.
 * A row left behind only adds one to its day's count, so a failure here is logged, not thrown.
 */
export async function releaseReservation(id: UsageRowId, usage: UsageStore = getUsageStore()): Promise<void> {
  try {
    await usage.delete(id);
  } catch (error) {
    console.error("askModel: could not take back a usage reservation", error);
  }
}

export class LimitReachedError extends Error {
  readonly reason = "limit-reached";
  constructor(
    message: string,
    /** Which limit turned the request away: a person's own, a visitor's free checks, or all visitors' together. */
    readonly limit: DailyLimit,
  ) {
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
