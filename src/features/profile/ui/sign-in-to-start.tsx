import Link from "next/link";
import { ButtonLink, Card } from "@/shared/ui";

/** Shown on the profile page to a signed-out visitor: the profile is saved to an account, so they sign in first. */
export function SignInToStart() {
  return (
    <Card>
      <h2 className="text-xl">Sign in to build your profile</h2>
      <p className="mt-2 max-w-[65ch] text-text-muted">
        Your profile is saved to your CVision account, so every tailored CV and cover letter can use it. You can download
        or delete it at any time. An account is free.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <ButtonLink href="/sign-up" variant="primary">
          Create a free account
        </ButtonLink>
        <Link href="/sign-in" className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent hover:underline">
          I already have an account
        </Link>
      </div>
    </Card>
  );
}
