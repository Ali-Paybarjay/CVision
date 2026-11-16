"use client";

import { Button, ButtonLink, Page } from "@/shared/ui";

/**
 * An error that no page caught, such as a bug (#508). It shows inside the root layout, so the header and footer stay.
 * Errors the pages expect, like a failed AI request, get their own message there. The error's own words never show:
 * they are for developers and may hold details. No hooks, so a test can call it as a function.
 */
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <Page title="Something went wrong on our side" description="Try again in a moment.">
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => retry()}>
          Try again
        </Button>
        <ButtonLink href="/">Go to the home page</ButtonLink>
      </div>
    </Page>
  );
}
