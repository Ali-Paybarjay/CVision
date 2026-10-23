"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { track } from "@/shared/analytics/track";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { getCurrentUser } from "./current-user";
import { deleteAccount, totalRows, type DeleteAccountResult } from "./data-rights";

export type DeleteAccountState =
  | { status: "idle" }
  | { status: "cancelled" | "failed"; title: string; message: string };

/** The word the user types as the second confirmation. Anything else, even "delete", cancels. */
const confirmationWord = "DELETE";

/** Where a deleted user lands: it clears this browser's CVision data and says what is not deleted straight away. */
const accountDeletedPath = "/dashboard/your-data/deleted";

const nothingDeleted = "Nothing was deleted";

/**
 * "Delete my account" (issue #43): deletes the signed-in user's CV files, account and every row linked to it,
 * signs this browser out and goes to the confirmation page. The user always comes from the session cookie,
 * never from the form, and only the exact word DELETE goes ahead.
 */
export async function deleteMyAccount(_: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  if (formData.get("confirmation") !== confirmationWord) {
    return { status: "cancelled", title: nothingDeleted, message: "You did not type DELETE, so your account and data are unchanged." };
  }

  const user = await getCurrentUser();
  if (!user) return { status: "failed", title: nothingDeleted, message: "You are signed out. Sign in again to delete your account." };

  const result = await deleteAccount(user.id);
  if (!result.ok) return failedState(result);

  // Deleting the user does not end their session, so sign this browser out as well.
  const supabase = await createSupabaseServerClient();
  try {
    await supabase?.auth.signOut();
  } catch {
    // The account is gone either way; the confirmation page must still show.
  }

  // Counts only, and no user id: the account no longer exists.
  const properties = { rows: totalRows(result.summary), cvFiles: result.summary.cvFiles };
  after(() => track("account.deleted", properties));
  redirect(accountDeletedPath);
}

function failedState(result: Exclude<DeleteAccountResult, { ok: true }>): DeleteAccountState {
  if (result.reason === "not-connected") {
    return { status: "failed", title: nothingDeleted, message: "Deleting accounts is not switched on yet. Try again later." };
  }
  const tryAgain = "Your account and the rest of your data are still here. Try again to finish.";
  if (result.cvFilesRemoved > 0 && result.step === "files") {
    return {
      status: "failed",
      title: "Your account was not deleted",
      message: `We deleted ${result.cvFilesRemoved} of your CV files, then something went wrong. ${tryAgain}`,
    };
  }
  if (result.cvFilesRemoved > 0) {
    return {
      status: "failed",
      title: "Your account was not deleted",
      message: `We deleted ${files(result.cvFilesRemoved)}, but could not delete your account. ${tryAgain}`,
    };
  }
  return { status: "failed", title: nothingDeleted, message: "We could not delete your account just now. Try again in a few minutes." };
}

function files(count: number) {
  return count === 1 ? "your CV file" : `your ${count} CV files`;
}
