import type { Metadata } from "next";
import { ButtonLink, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Every address that matches no page, and every notFound() with no not-found file of its own (#508). It shows inside
 * the root layout, so the header and footer stay, and Next's default page, which painted the body white or pure black
 * over the Canvas, never shows.
 */
export default function NotFound() {
  return (
    <Page title="We could not find this page" description="The link may be wrong, or the page may have moved.">
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/" variant="primary">
          Go to the home page
        </ButtonLink>
        <ButtonLink href="/dashboard">Go to your dashboard</ButtonLink>
      </div>
    </Page>
  );
}
