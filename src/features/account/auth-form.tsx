"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { flushSync } from "react-dom";
import { brand } from "@/shared/brand";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { signIn, signUp, type AuthFormState } from "./actions";
import { FullReloadField, useFullReloadAction } from "./full-reload";
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
  // Signed in: the next page loads afresh, so no page kept from before (another account's, perhaps) survives (#350).
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    useFullReloadAction(mode === "sign-up" ? signUp : signIn),
    {},
  );
  const text = copy[mode];
  // A pilot asked to see the password while typing it (8 November).
  const [showPassword, setShowPassword] = useState(false);

  if (state.checkEmail) return <CheckEmailNotice email={state.checkEmail} next={next} />;

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
              // While it is shown the field is plain text, so a phone keyboard would capitalise or correct the
              // password. These do nothing while it is hidden.
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={8}
              required
              disabled={disabled}
              className="min-w-0 flex-1"
            />
            <ShowPasswordButton
              shown={showPassword}
              controls={props.id}
              onToggle={() => {
                // The field becomes type="text" first, then Safari's own mask is lifted (see revealAutofilledPassword).
                flushSync(() => setShowPassword((shown) => !shown));
                const input = document.getElementById(props.id) as HTMLInputElement | null;
                if (input?.type === "text") revealAutofilledPassword(input);
              }}
              disabled={disabled}
            />
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

/**
 * After Create account, until the user opens the link in the email (#507): who sends it, and a way on for a mistyped
 * address or a link already opened. Exported for its test.
 */
export function CheckEmailNotice({ email, next }: { email: string; next: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Notice tone="success" title="Check your email">
        We sent a link to {email}. Open it to finish creating your account. It comes from {brand.contactEmail} and can
        take a few minutes. If it isn’t in your inbox, look in your spam or junk folder.
      </Notice>
      <div className="flex flex-col gap-2 text-sm text-text-muted">
        <p>
          Wrong address?{" "}
          {/* A plain link, so the page loads afresh with an empty form: Link would keep this notice on the same page. */}
          <a href={withNext("/sign-up", next)} className="font-semibold text-accent hover:underline">
            Use a different email
          </a>
        </p>
        <p>
          Already opened the link?{" "}
          <Link href={withNext("/sign-in", next)} className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Safari, and every browser on an iPhone, keeps a password it filled in itself (from the Keychain, or its Strong
 * Password) masked even once the field is type="text": its own stylesheet says `input:-webkit-autofill-and-obscured
 * { -webkit-text-security: disc !important }`, which no page CSS can undo. A user pressed Show and still saw dots
 * (18 November, #521). Setting the value from script, to the same value, ends that state in WebKit; nothing else
 * changes. Elsewhere the selector is unknown and `matches` throws, and type="text" already shows the password.
 * Exported for its test.
 */
export function revealAutofilledPassword(input: Pick<HTMLInputElement, "matches" | "value"> | null): void {
  if (!input) return;
  // A Strong Password Safari made is left alone: setting the value would tell Safari the page dropped it, and it may
  // then not save it to the Keychain. Safari shows that kind on its own anyway.
  if (matchesSelector(input, ":-webkit-autofill-and-obscured") && !matchesSelector(input, ":-webkit-autofill-strong-password")) {
    const value = input.value;
    input.value = value;
  }
}

/** False, not an error, in a browser that doesn't know the selector (only WebKit knows these). */
function matchesSelector(input: Pick<HTMLInputElement, "matches">, selector: string): boolean {
  try {
    return input.matches(selector);
  } catch {
    return false;
  }
}

/**
 * Shows or hides the password. The button says what it will do ("Show", "Hide") and its name says the same with the
 * field's name, so a voice-control user can say the word they see (WCAG 2.5.3, Label in Name). Exported for its test.
 */
export function ShowPasswordButton({
  shown,
  controls,
  onToggle,
  disabled,
}: {
  shown: boolean;
  controls: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="compact"
      aria-label={shown ? "Hide password" : "Show password"}
      aria-controls={controls}
      onClick={onToggle}
      disabled={disabled}
    >
      {shown ? "Hide" : "Show"}
    </Button>
  );
}
