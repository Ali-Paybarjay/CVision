import { SignInCard } from "@/features/account/sign-in-card";

type SignInToStartProps = {
  /** What signing in is for. */
  title?: string;
  /** Why the page needs an account, in one or two sentences. */
  text?: string;
  /** The page both links bring the user back to. */
  next?: string;
};

/**
 * Shown to a signed-out visitor on a page that keeps their work in their account (Profile, Jobs): the app's one
 * sign-in card (SignInCard), with Profile's wording as the default. No Back above it: the steps bar and the menu at
 * the top of the page lead everywhere else.
 */
export function SignInToStart({
  title = "Sign in to build your profile",
  text = "Your profile is saved to your CVision account, so every tailored CV and cover letter can use it. You can download or delete it at any time.",
  next = "/profile",
}: SignInToStartProps) {
  return <SignInCard title={title} text={text} next={next} />;
}
