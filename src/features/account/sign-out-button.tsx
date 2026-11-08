"use client";

import { useActionState } from "react";
import { Button } from "@/shared/ui";
import { signOut, type SignOutState } from "./actions";
import { clearBrowserData } from "./browser-data";
import { FullReloadField, useFullReload } from "./full-reload";

/**
 * Sign out, clearing CVision's data from this browser on the way (issue #35), so the next person on it sees none
 * of it. Then home loads as a new page, so no page Next kept alive from this account survives either (#350). The
 * form still posts to the signOut action without JavaScript, and the server's redirect is a full load there.
 */
export function SignOutButton({ appearance = "button" }: { appearance?: "button" | "link" } = {}) {
  const [state, action, pending] = useActionState<SignOutState, FormData>(signOut, {});
  useFullReload(state.go);
  return <SignOutForm action={action} pending={pending} appearance={appearance} />;
}

/** The form itself, apart from the action's state, so a test can read it without rendering. */
export function SignOutForm({
  action,
  pending,
  appearance = "button",
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  appearance?: "button" | "link";
}) {
  return (
    <form action={action} onSubmit={() => clearBrowserData()}>
      <FullReloadField />
      {appearance === "link" ? (
        // In the site header, among the page links (#328).
        <button type="submit" disabled={pending} className="block py-2 text-sm font-semibold text-accent hover:underline">
          Sign out
        </button>
      ) : (
        <Button type="submit" disabled={pending}>
          Sign out
        </Button>
      )}
    </form>
  );
}
