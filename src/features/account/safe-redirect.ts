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

  if (target.origin !== site) return fallback;
  // "/..//evil.com" resolves to the path "//evil.com", which a browser reads as another site (found 18 November).
  const path = `${target.pathname}${target.search}`;
  return path.startsWith("//") || path.startsWith("/\\") ? fallback : path;
}

/** Where the link in a "reset your password" email lands, once /auth/confirm has signed the user in (#524). */
export const newPasswordPath = "/sign-in/new-password";

/** True when a safe `next` is the new password page, i.e. the link that failed was a reset link. */
export function isNewPasswordStep(next: string): boolean {
  return new URL(next, site).pathname === newPasswordPath;
}

/**
 * The page a reset link was taking the user to, without the new password step in front of it. A reset link that
 * fails carries "/sign-in/new-password?next=…" on to /sign-in/link-expired; asking for a new link from there must not
 * put that step inside the next link too, or the user lands on the new password form again after saving.
 */
export function pastNewPasswordStep(next: string): string {
  let path = next;
  for (let step = 0; step < 5 && isNewPasswordStep(path); step++) {
    path = safeRedirectPath(new URL(path, site).searchParams.get("next"));
  }
  return isNewPasswordStep(path) ? defaultDestination : path;
}

/** `path` with `next` as its return address, e.g. withNext("/sign-in", "/interview?job=1"). */
export function withNext(path: string, next: string): string {
  return next === defaultDestination ? path : `${path}?next=${encodeURIComponent(next)}`;
}
