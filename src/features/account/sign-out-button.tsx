"use client";

import { Button } from "@/shared/ui";
import { signOut } from "./actions";
import { clearBrowserData } from "./browser-data";

/**
 * Sign out, clearing CVision's data from this browser on the way (issue #35), so the next person on it sees none
 * of it. The form still posts to the signOut action without JavaScript; only the clearing needs it.
 */
export function SignOutButton() {
  return (
    <form action={signOut} onSubmit={() => clearBrowserData()}>
      <Button type="submit">Sign out</Button>
    </form>
  );
}
