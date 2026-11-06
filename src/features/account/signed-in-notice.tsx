import { ButtonLink, Notice } from "@/shared/ui";
import { SignOutButton } from "./sign-out-button";

/**
 * On /sign-in and /sign-up for a user who is already signed in (#328), in place of the form: which account they are
 * in, a way on, and a way out. Without it, someone signing up for a second account stays in the first one and sees
 * its data, and an email that already has an account gets no confirmation email.
 */
export function SignedInNotice({ email, next, mode }: { email: string | null; next: string; mode: "sign-in" | "sign-up" }) {
  const toSwitch = mode === "sign-up" ? "To create another account, sign out first." : "To use another account, sign out first.";

  return (
    <div className="flex flex-col gap-5">
      <Notice tone="info" title="You’re already signed in">
        You’re signed in as <span className="font-semibold wrap-anywhere">{email ?? "your account"}</span>. {toSwitch}
      </Notice>
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href={next} variant="primary">
          Continue
        </ButtonLink>
        <SignOutButton />
      </div>
    </div>
  );
}
