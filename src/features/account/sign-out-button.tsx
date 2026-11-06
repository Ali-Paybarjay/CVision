"use client";

import { Button } from "@/shared/ui";
import { signOut } from "./actions";
import { clearBrowserData } from "./browser-data";

/**
 * Sign out, clearing CVision's data from this browser on the way (issue #35), so the next person on it sees none
 * of it. The form still posts to the signOut action without JavaScript; only the clearing needs it.
 */
export function SignOutButton({ appearance = "button" }: { appearance?: "button" | "link" } = {}) {
  return (
    <form action={signOut} onSubmit={() => clearBrowserData()}>
      {appearance === "link" ? (
        // In the site header, among the page links (#328).
        <button type="submit" className="block py-2 text-sm font-semibold text-accent hover:underline">
          Sign out
        </button>
      ) : (
        <Button type="submit">Sign out</Button>
      )}
    </form>
  );
}
