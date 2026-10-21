import type { Metadata } from "next";
import { ButtonLink, Notice, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Link expired" };

export default function LinkExpiredPage() {
  return (
    <Page title="This link has expired">
      <Notice tone="warning" title="We could not confirm your email">
        Links work once and expire after a while. Sign in, or create your account again to get a new link.
      </Notice>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/sign-in" variant="primary">
          Sign in
        </ButtonLink>
        <ButtonLink href="/sign-up">Create account</ButtonLink>
      </div>
    </Page>
  );
}
