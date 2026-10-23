"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { signIn, signUp, type AuthFormState } from "./actions";
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
      <input type="hidden" name="next" value={next} />
      <Field label="Email" error={state.fieldErrors?.email}>
        {(props) => <Input {...props} name="email" type="email" autoComplete="email" required disabled={disabled} />}
      </Field>
      <Field
        label="Password"
        hint={mode === "sign-up" ? "At least 8 characters." : undefined}
        error={state.fieldErrors?.password}
      >
        {(props) => (
          <Input
            {...props}
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={8}
            required
            disabled={disabled}
          />
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
