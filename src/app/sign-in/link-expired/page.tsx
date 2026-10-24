import type { Metadata } from "next";
import { Suspense } from "react";
import { defaultDestination, safeRedirectPath, withNext } from "@/features/account/safe-redirect";
import { ButtonLink, Notice, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Link expired" };

export default function LinkExpiredPage({ searchParams }: PageProps<"/sign-in/link-expired">) {
  return (
    <Page title="This link has expired">
      <Notice tone="warning" title="We could not confirm your email">
        Links work once and expire after a while. Sign in, or create your account again to get a new link.
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
    </div>
  );
}
