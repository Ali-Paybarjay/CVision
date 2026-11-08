import Link from "next/link";
import { brand } from "@/shared/brand";
import { ButtonLink, Card } from "@/shared/ui";
import { withNext } from "./safe-redirect";

type SignInCardProps = {
  /** What signing in is for, e.g. "Sign in for interview practice". */
  title: string;
  /** Why the page needs an account, in one or two sentences. */
  text: string;
  /** The page both links bring the user back to, with its query (a job's id), so nothing is lost on the way. */
  next: string;
  /** The heading level, so the card fits the page's outline: h2 under the page's h1, h1 when it is the page. */
  as?: "h1" | "h2";
};

/**
 * The one message a signed-out visitor gets on every page that needs an account: Profile, Jobs, Tailor, Interview,
 * the dashboard, a saved job ad and what was sent with Apply. A pilot (8 November) found a different message on each,
 * some with only "Sign in" and Tailor with neither, and asked for the same message everywhere with both choices.
 * The Coral button says what it does and "free" goes in the small line under it, as every call to action does
 * (docs/brand.md, Calls to action). Both links come back to `next`.
 */
export function SignInCard({ title, text, next, as: Heading = "h2" }: SignInCardProps) {
  return (
    <Card>
      <Heading className={Heading === "h1" ? "text-2xl" : "text-xl"}>{title}</Heading>
      <p className="mt-2 max-w-[65ch] text-text-muted">{text}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <ButtonLink href={withNext("/sign-up", next)} variant="primary" aria-describedby="sign-in-card-note">
            Create your account
          </ButtonLink>
          <p id="sign-in-card-note" className="mt-2 text-sm text-text-muted">
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
  );
}
