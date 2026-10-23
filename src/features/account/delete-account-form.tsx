"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { brand } from "@/shared/brand";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { deleteMyAccount, type DeleteAccountState } from "./data-rights-actions";

const idle: DeleteAccountState = { status: "idle" };
const cancelledHere: DeleteAccountState = {
  status: "cancelled",
  title: "Nothing was deleted",
  message: "You cancelled, so your account and data are unchanged.",
};

/**
 * "Delete my account" with two confirmations: the button opens the form, then only typing DELETE deletes.
 * Anything else, or Cancel, says "Nothing was deleted". After a deletion the action moves to the confirmation page.
 */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteMyAccount, idle);
  const [open, setOpen] = useState(false);
  // The answer from the server stays in state; hide it once the user has moved on (opened or cancelled again).
  const [seen, setSeen] = useState<DeleteAccountState>(idle);
  const [cancelled, setCancelled] = useState(false);

  const notice = cancelled ? cancelledHere : state !== seen && state.status !== "idle" ? state : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 id="delete-title" className="text-xl">
          Delete my account
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">
          This deletes, straight away, your account, every record listed above, your CV files and the {brand.name} data
          saved in this browser. It cannot be undone, so download your data first if you want a copy.
        </p>
        <p className="mt-2 max-w-[65ch] text-sm text-text-muted">
          A few copies, such as backups and service logs, are not deleted straight away.{" "}
          <Link href="/privacy#not-deleted-straight-away" className="font-semibold text-accent hover:underline">
            See which, and for how long
          </Link>
          .
        </p>
      </div>

      {notice && notice.status !== "idle" && (
        <Notice tone={notice.status === "failed" ? "error" : "info"} title={notice.title}>
          {notice.message}
        </Notice>
      )}

      {open ? (
        <form action={action} className="flex flex-col gap-4">
          <Field label="Type DELETE to confirm" hint="In capital letters. Anything else cancels and deletes nothing.">
            {(props) => (
              <Input
                {...props}
                name="confirmation"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                className="sm:max-w-xs"
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Deleting your account…" : "Delete my account for good"}
            </Button>
            <Button
              variant="quiet"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setCancelled(true);
                setSeen(state);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          className="self-start"
          onClick={() => {
            setOpen(true);
            setCancelled(false);
            setSeen(state);
          }}
        >
          Delete my account
        </Button>
      )}
    </div>
  );
}
