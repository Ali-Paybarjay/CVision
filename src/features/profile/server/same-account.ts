/**
 * A profile page that was open when someone signed in to another account in this browser, in another tab or after
 * the session ended, still shows the first account's form, file and profile. Uploads and saves act for whoever is
 * signed in now, so without a check that page could read the first account's CV into the second account, or save over
 * the second account's profile (#350). So the page sends the account it was built for, and the server refuses an
 * upload or a save when that is not the account signed in now.
 */
export const pageAccountField = "account";

export const otherAccountMessage =
  "You’re now signed in to a different account in this browser. Reload the page to see that account’s profile.";

/** True when the form says the page was built for another account than `userId`. A form without the field passes. */
export function builtForAnotherAccount(form: FormData, userId: string): boolean {
  const account = form.get(pageAccountField);
  return typeof account === "string" && account !== "" && account !== userId;
}
