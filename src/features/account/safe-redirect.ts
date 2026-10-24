/** Where users go after signing in or confirming their email when no return address is given. */
export const defaultDestination = "/dashboard";

// Any fixed origin works: it only tells paths on this site apart from other sites.
const site = "https://cvision.invalid";

/**
 * Turns a `next` value from a link, form or search params into a path on this site, or the fallback.
 * It must start with one "/" ("//evil.com" and "/\evil.com" are other sites to a browser), so it has no
 * scheme either. Real URL parsing then catches tricks like "/\t/evil.com", which browsers read as "//evil.com".
 */
export function safeRedirectPath(next: unknown, fallback = defaultDestination): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;

  let target: URL;
  try {
    target = new URL(next, site);
  } catch {
    return fallback;
  }

  return target.origin === site ? `${target.pathname}${target.search}` : fallback;
}

/** `path` with `next` as its return address, e.g. withNext("/sign-in", "/interview?job=1"). */
export function withNext(path: string, next: string): string {
  return next === defaultDestination ? path : `${path}?next=${encodeURIComponent(next)}`;
}
