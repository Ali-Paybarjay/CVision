import type { Metadata } from "next";
import { Suspense } from "react";
import {
  defaultDestination,
  isNewPasswordStep,
  pastNewPasswordStep,
  safeRedirectPath,
  withNext,
} from "@/features/account/safe-redirect";
import { ButtonLink, Notice, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Link expired" };

export default function LinkExpiredPage({ searchParams }: PageProps<"/sign-in/link-expired">) {
  return (
    <Page title="This link has expired">
      <Suspense fallback={<NextSteps next={defaultDestination} />}>
        <NextStepsFromUrl searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

// Keeps the page the user was heading to (/auth/confirm passes it on as ?next=). A failed "reset your password" link
// (#524) passes on the new password page, with the real destination inside it: the buttons go straight there.
async function NextStepsFromUrl({ searchParams }: Pick<PageProps<"/sign-in/link-expired">, "searchParams">) {
  const next = safeRedirectPath((await searchParams).next);
  return <NextSteps next={pastNewPasswordStep(next)} reset={isNewPasswordStep(next)} />;
}

/** Exported for its test. */
export function NextSteps({ next, reset = false }: { next: string; reset?: boolean }) {
  if (reset) {
    return (
      <>
        <Notice tone="warning" title="We couldn’t use this link">
          Password links work once and expire after a while. Ask for a new one, then open it in the browser you’re
          using now.
        </Notice>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={withNext("/sign-in/forgot", next)} variant="primary">
            Send me a new link
          </ButtonLink>
          <ButtonLink href={withNext("/sign-in", next)}>Sign in</ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <Notice tone="warning" title="We couldn’t use this link">
        Links work once, expire after a while, and only work in the browser where you asked for them. Sign in, create
        your account again to get a new link, or reset your password.
      </Notice>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={withNext("/sign-in", next)} variant="primary">
          Sign in
        </ButtonLink>
        <ButtonLink href={withNext("/sign-up", next)}>Create account</ButtonLink>
        <ButtonLink href={withNext("/sign-in/forgot", next)} variant="quiet">
          Reset your password
        </ButtonLink>
      </div>
    </>
  );
}
