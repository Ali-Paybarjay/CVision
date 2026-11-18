import type { Metadata } from "next";
import { Suspense } from "react";
import { defaultDestination, safeRedirectPath, withNext } from "@/features/account/safe-redirect";
import { ButtonLink, Notice, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Link expired" };

export default function LinkExpiredPage({ searchParams }: PageProps<"/sign-in/link-expired">) {
  return (
    <Page title="This link has expired">
      <Notice tone="warning" title="We couldn’t use this link">
        Links work once, expire after a while, and only work in the browser where you asked for them. Sign in, create
        your account again to get a new link, or reset your password.
      </Notice>
      <Suspense fallback={<NextSteps next={defaultDestination} />}>
        <NextStepsFromUrl searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

// Keeps the page the user was heading to (/auth/confirm passes it on as ?next=).
async function NextStepsFromUrl({ searchParams }: Pick<PageProps<"/sign-in/link-expired">, "searchParams">) {
  return <NextSteps next={safeRedirectPath((await searchParams).next)} />;
}

function NextSteps({ next }: { next: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <ButtonLink href={withNext("/sign-in", next)} variant="primary">
        Sign in
      </ButtonLink>
      <ButtonLink href={withNext("/sign-up", next)}>Create account</ButtonLink>
      {/* The same page catches a "reset your password" link that no longer works (#524). */}
      <ButtonLink href={withNext("/sign-in/forgot", next)} variant="quiet">
        Reset your password
      </ButtonLink>
    </div>
  );
}
