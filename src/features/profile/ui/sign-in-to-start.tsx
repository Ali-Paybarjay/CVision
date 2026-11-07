import Link from "next/link";
import { withNext } from "@/features/account/safe-redirect";
import { brand } from "@/shared/brand";
import { ButtonLink, Card } from "@/shared/ui";

type SignInToStartProps = {
  /** What signing in is for. */
  title?: string;
  /** Why the page needs an account, in one or two sentences. */
  text?: string;
  /** The page both links bring the user back to. */
  next?: string;
};

/**
 * Shown to a signed-out visitor on a page that keeps their work in their account (Profile, Jobs): create an account
 * or sign in, then come back to the same page. The Coral button says what it does, and "free" goes in the small line
 * under it, as every call to action does (docs/brand.md, Calls to action). No Back above it: the steps bar and the
 * menu at the top of the page lead everywhere else.
 */
export function SignInToStart({
  title = "Sign in to build your profile",
  text = "Your profile is saved to your CVision account, so every tailored CV and cover letter can use it. You can download or delete it at any time.",
  next = "/profile",
}: SignInToStartProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-xl">{title}</h2>
        <p className="mt-2 max-w-[65ch] text-text-muted">{text}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div>
            <ButtonLink href={withNext("/sign-up", next)} variant="primary" aria-describedby="sign-in-to-start-note">
              Create your account
            </ButtonLink>
            <p id="sign-in-to-start-note" className="mt-2 text-sm text-text-muted">
              {brand.cta.primaryNote}
            </p>
          </div>
          <Link
            href={withNext("/sign-in", next)}
            className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent hover:underline"
          >
            I already have an account
          </Link>
        </div>
      </Card>
    </div>
  );
}
