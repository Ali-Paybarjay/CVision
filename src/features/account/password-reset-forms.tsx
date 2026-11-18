"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { brand } from "@/shared/brand";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { requestPasswordReset, setNewPassword, type NewPasswordState, type ResetRequestState } from "./actions";
import { ShowPasswordButton } from "./auth-form";
import { FullReloadField, useFullReloadAction } from "./full-reload";
import { defaultDestination, withNext } from "./safe-redirect";

/**
 * "Forgot your password?" (#524): asks for the email and sends a link. The success message is the same whether or not
 * the email has an account.
 */
export function ForgotPasswordForm({ next = defaultDestination, disabled = false }: { next?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(requestPasswordReset, {});

  if (state.sentTo) return <ResetLinkSent email={state.sentTo} next={next} />;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" hint="The email you use for CVision." error={state.fieldError}>
        {(props) => <Input {...props} name="email" type="email" autoComplete="email" required disabled={disabled} />}
      </Field>
      <Button type="submit" variant="primary" disabled={disabled || pending}>
        {pending ? "Sending the link…" : "Send me a link"}
      </Button>
      <p className="text-sm text-text-muted">
        Remembered it?{" "}
        <Link href={withNext("/sign-in", next)} className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** After "Send me a link": the same words whether or not the email has an account. Exported for its test. */
export function ResetLinkSent({ email, next }: { email: string; next: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Notice tone="success" title="Check your email">
        If <span className="font-semibold wrap-anywhere">{email}</span> has a CVision account, we’ve sent it a link to choose a new password. It comes from {brand.contactEmail}{" "}
        and can take a few minutes. If it isn’t in your inbox, look in your spam or junk folder. Open the link in this
        browser.
      </Notice>
      <p className="text-sm text-text-muted">
        No email?{" "}
        {/* A plain link, so the page loads afresh with an empty form: Link would keep this notice on the same page. */}
        <a href={withNext("/sign-in/forgot", next)} className="font-semibold text-accent hover:underline">
          Try again
        </a>
      </p>
    </div>
  );
}

/**
 * "Choose a new password", for the user the reset link has just signed in. On success the page they were heading to
 * loads afresh, as after signing in (#350).
 */
export function NewPasswordForm({ email, next = defaultDestination }: { email: string | null; next?: string }) {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(useFullReloadAction(setNewPassword), {});
  const [showPassword, setShowPassword] = useState(false);

  if (state.expired) return <ResetLinkExpired next={next} />;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {email && (
        <p className="text-text-muted">
          For <span className="font-semibold wrap-anywhere">{email}</span>
        </p>
      )}
      {/* Tells a password manager which account the new password is for. No name, so the form never sends it. */}
      {email && <input type="email" autoComplete="username" value={email} readOnly hidden />}
      <input type="hidden" name="next" value={next} />
      <FullReloadField />
      <Field label="New password" hint="At least 8 characters." error={state.fieldError}>
        {(props) => (
          <div className="flex items-stretch gap-2">
            <Input
              {...props}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={8}
              required
              className="min-w-0 flex-1"
            />
            <ShowPasswordButton shown={showPassword} controls={props.id} onToggle={() => setShowPassword((shown) => !shown)} />
          </div>
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save my new password"}
      </Button>
    </form>
  );
}

/** Nobody is signed in: the page was opened without the link from the email, or that sign-in has ended. */
export function ResetLinkExpired({ next }: { next: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Notice tone="warning" title="Open the link from your email first">
        This page works after you open the link we emailed you, in this browser. If the link has expired or was used
        already, ask for a new one.
      </Notice>
      <div>
        <Link
          href={withNext("/sign-in/forgot", next)}
          className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
        >
          Send me a new link
        </Link>
      </div>
    </div>
  );
}
