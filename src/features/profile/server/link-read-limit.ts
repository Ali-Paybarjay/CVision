import "server-only";
import { getAnonymousKey, type Requester } from "@/shared/ai";
import { getUsageStore, NO_MODEL, noUsage, reserveWithinFeatureLimit, type UsageRowId } from "@/shared/ai/usage";
import type { LinkLimitReason } from "../job-link";

/** Our server opening the link to a job ad, by its name in the usage log (#391). */
export const LINK_READ_FEATURE = "profile-link";

const DEFAULT_LINK_READS_PER_DAY = 30;

/** How many pages our server may open from one person's links in a UTC day. Change it on Vercel without a code change. */
export function getLinkReadDailyLimit(): number {
  const value = process.env.LINK_READ_DAILY_LIMIT?.trim();
  const limit = value ? Number(value) : NaN;
  return Number.isInteger(limit) && limit >= 0 ? limit : DEFAULT_LINK_READS_PER_DAY;
}

export type LinkReadReservation = { ok: true; id: UsageRowId } | { ok: false; reason: LinkLimitReason };

/**
 * Takes one of the day's link reads before our server opens a page (#391). Without a limit one account could have
 * CVision open a job site's pages in a loop until the site blocks us, and then "Get the ad" fails there for everyone.
 * A signed-out visitor (the demo) counts against the day's visitor key. When the usage log can't count, nothing is opened.
 */
export async function reserveLinkRead(requester: Requester | undefined): Promise<LinkReadReservation> {
  try {
    const id = await reserveWithinFeatureLimit(
      { requester: requester ?? (await getAnonymousKey()), feature: LINK_READ_FEATURE },
      getLinkReadDailyLimit(),
    );
    return id === null ? { ok: false, reason: "limit" } : { ok: true, id };
  } catch (error) {
    console.error("jobs: could not count today's link reads", error);
    return { ok: false, reason: "limit-error" };
  }
}

/** Notes whether the page could be read, as askModel notes whether a request worked. A failure is only logged. */
export async function settleLinkRead(id: UsageRowId, read: boolean): Promise<void> {
  try {
    await getUsageStore().update(id, { ...noUsage(NO_MODEL), ok: read });
  } catch (error) {
    console.error("jobs: could not note a link read", error);
  }
}
