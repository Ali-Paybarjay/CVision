/**
 * Turns a `next` value from a link into a path on this site, or the fallback.
 * Compares origins after real URL parsing, because browsers read tricks like
 * "/\evil.com" or "/\t/evil.com" as links to another site.
 */
export function safeRedirectPath(next: string | null, requestUrl: string, fallback = "/dashboard"): string {
  if (!next) return fallback;

  const site = new URL(requestUrl);
  let target: URL;
  try {
    target = new URL(next, site);
  } catch {
    return fallback;
  }

  return target.origin === site.origin ? `${target.pathname}${target.search}` : fallback;
}
