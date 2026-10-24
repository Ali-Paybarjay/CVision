import "server-only";
import { cookies } from "next/headers";
import { accountDeletedPath } from "./data-rights-paths";

/**
 * A short-lived cookie that says this browser has just deleted its account (issue #43). Only the confirmation page
 * receives it, and only that page clears the browser's data, so opening its address any other way (from history,
 * a link or autocomplete) clears nothing. Strictly necessary: it only shows the deletion the user asked for.
 */
const flagCookie = "cvision-account-deleted";
const flagMaxAgeSeconds = 120;

/** Call from the deletion's Server Action, after the account is gone and before redirecting to the page. */
export async function markAccountDeleted(): Promise<void> {
  (await cookies()).set(flagCookie, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: accountDeletedPath,
    maxAge: flagMaxAgeSeconds,
  });
}

/** Whether this browser deleted its account in the last two minutes. Reads cookies: render inside <Suspense>. */
export async function accountJustDeleted(): Promise<boolean> {
  return (await cookies()).has(flagCookie);
}
