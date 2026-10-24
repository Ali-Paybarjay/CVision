"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { track } from "@/shared/analytics/track";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { deleteAccount, totalRows, type DeleteAccountResult } from "./data-rights";
import { accountDeletedPath } from "./data-rights-paths";
import { markAccountDeleted } from "./deleted-flag";
import { getVerifiedUser } from "./verified-user";

export type DeleteAccountState =
  | { status: "idle" }
  /** partial: an earlier try already deleted, or may have deleted, some CV files, so "Nothing was deleted" is untrue. */
  | { status: "cancelled" | "failed"; title: string; message: string; partial: boolean };

/** The word the user types as the second confirmation. Anything else, even "delete", cancels. */
const confirmationWord = "DELETE";

const stillHere = "Your account and the rest of your data are still here.";

/**
 * "Delete my account" (issue #43): deletes the signed-in user's CV files, account and every row linked to it,
 * signs this browser out and goes to the confirmation page. The user always comes from the session, checked with
 * Supabase Auth itself, never from the form, and only the exact word DELETE goes ahead.
 */
export async function deleteMyAccount(previous: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const partial = previous.status !== "idle" && previous.partial;
  const nothing = nothingDeleted(partial);

  if (formData.get("confirmation") !== confirmationWord) {
    const message = partial ? `You did not type DELETE. ${stillHere}` : "You did not type DELETE, so your account and data are unchanged.";
    return { status: "cancelled", title: nothing, message, partial };
  }

  // Not getCurrentUser: a token from a session that was signed out, or of an account deleted elsewhere, still
  // passes its signature check until it expires.
  const user = await getVerifiedUser();
  if (!user) {
    return { status: "failed", title: nothing, message: "We could not confirm that you are signed in. Sign in again, then try once more.", partial };
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) {
    // CV files may have gone: refresh the page so its counts show what is left.
    if (result.reason === "failed" && result.removeAttempted) refresh();
    return failedState(result, partial);
  }

  // Deleting the user does not end their session, so sign this browser out as well.
  await signOutThisBrowser();
  // Only a browser that has just deleted its account sees the confirmation page, which clears its data.
  await markAccountDeleted();

  // Counts only, and no user id: the account no longer exists.
  const properties = { rows: totalRows(result.summary), cvFiles: result.summary.cvFiles };
  after(() => track("account.deleted", properties));
  redirect(accountDeletedPath);
}

function failedState(result: Exclude<DeleteAccountResult, { ok: true }>, partial: boolean): DeleteAccountState {
  const nothing = nothingDeleted(partial);
  if (result.reason === "not-connected") {
    return { status: "failed", title: nothing, message: "Deleting accounts is not switched on yet. Try again later.", partial };
  }

  const notDeleted = "Your account was not deleted";
  const tryAgain = `${stillHere} Try again to finish.`;
  if (result.step === "files" && result.cvFilesRemoved > 0) {
    return {
      status: "failed",
      title: notDeleted,
      message: `We deleted ${result.cvFilesRemoved} of your CV files, then something went wrong. ${tryAgain}`,
      partial: true,
    };
  }
  if (result.step === "files" && result.removeAttempted) {
    // Storage can delete files and still answer with an error, so they may be gone even though none were confirmed.
    return {
      status: "failed",
      title: notDeleted,
      message: `Some of your CV files may have been deleted, then something went wrong. ${tryAgain}`,
      partial: true,
    };
  }
  if (result.cvFilesRemoved > 0) {
    return {
      status: "failed",
      title: notDeleted,
      message: `We deleted ${files(result.cvFilesRemoved)}, but could not delete your account. ${tryAgain}`,
      partial: true,
    };
  }
  return { status: "failed", title: nothing, message: "We could not delete your account just now. Try again in a few minutes.", partial };
}

/** "Nothing was deleted", or after a try that deleted some files, "Nothing more was deleted". */
function nothingDeleted(partial: boolean) {
  return partial ? "Nothing more was deleted" : "Nothing was deleted";
}

function files(count: number) {
  return count === 1 ? "your CV file" : `your ${count} CV files`;
}

/**
 * Signs this browser out. If Supabase cannot be reached to end the session, removes the session cookies here, so
 * this browser is signed out either way. The account is already gone, so this never stops the confirmation.
 */
async function signOutThisBrowser() {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase?.auth.signOut({ scope: "local" });
    if (!result?.error) return;
  } catch {
    // Remove the cookies below.
  }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    // sb-<project>-auth-token, its .0, .1 parts and the sign-up code verifiers.
    if (name.startsWith("sb-") && name.includes("-auth-token")) store.delete(name);
  }
}
