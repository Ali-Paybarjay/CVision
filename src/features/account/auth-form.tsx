"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { signIn, signUp, type AuthFormState } from "./actions";
import { FullReloadField, useFullReload } from "./full-reload";
import { defaultDestination, withNext } from "./safe-redirect";

const copy = {
  "sign-up": { submit: "Create account", pending: "Creating account…", switchText: "Already have an account?", switchLink: "Sign in", switchHref: "/sign-in" },
  "sign-in": { submit: "Sign in", pending: "Signing in…", switchText: "New to CVision?", switchLink: "Create a free account", switchHref: "/sign-up" },
} as const;

/** `next` is where to send the user afterwards: a path already checked with safeRedirectPath. */
export function AuthForm({
  mode,
  disabled = false,
  next = defaultDestination,
}: {
  mode: "sign-up" | "sign-in";
  disabled?: boolean;
  next?: string;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(mode === "sign-up" ? signUp : signIn, {});
  const text = copy[mode];
  // A pilot asked to see the password while typing it (8 November).
  const [showPassword, setShowPassword] = useState(false);
  // Signed in: load the next page afresh, so no page kept from before (another account's, perhaps) survives (#350).
  useFullReload(state.go);

  if (state.checkEmail) {
    return (
      <Notice tone="success" title="Check your email">
        We sent a link to {state.checkEmail}. Open it to finish creating your account.
      </Notice>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.existingAccount && (
        <Notice tone="info" title="You already have an account">
          {state.existingAccount} already has a CVision account.{" "}
          <Link href={withNext("/sign-in", next)} className="font-semibold text-accent hover:underline">
            Sign in instead
          </Link>
          .
        </Notice>
      )}
      <input type="hidden" name="next" value={next} />
      <FullReloadField />
      <Field label="Email" error={state.fieldErrors?.email}>
        {(props) => <Input {...props} name="email" type="email" autoComplete="email" required disabled={disabled} />}
      </Field>
      <Field
        label="Password"
        hint={mode === "sign-up" ? "At least 8 characters." : undefined}
        error={state.fieldErrors?.password}
      >
        {(props) => (
          <div className="flex items-stretch gap-2">
            <Input
              {...props}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={8}
              required
              disabled={disabled}
              className="min-w-0 flex-1"
            />
            {/* The name stays "Show password"; aria-pressed says whether it is shown, as the pattern for a toggle asks. */}
            <Button
              type="button"
              size="compact"
              aria-label="Show password"
              aria-pressed={showPassword}
              aria-controls={props.id}
              onClick={() => setShowPassword((shown) => !shown)}
              disabled={disabled}
            >
              {showPassword ? "Hide" : "Show"}
            </Button>
          </div>
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={disabled || pending}>
        {pending ? text.pending : text.submit}
      </Button>
      <p className="text-sm text-text-muted">
        {text.switchText}{" "}
        <Link href={withNext(text.switchHref, next)} className="font-semibold text-accent hover:underline">
          {text.switchLink}
        </Link>
      </p>
    </form>
  );
}
