import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/shared/brand";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { ButtonLink, Card, Page } from "@/shared/ui";
import { ClearBrowserData } from "./clear-browser-data";
import { getCurrentUser } from "./current-user";

/**
 * What is not deleted straight away, and for how long (issue #43). Only checked facts: the research for the
 * Privacy page, which has the full version at /privacy#not-deleted-straight-away. Change both together.
 */
export const notDeletedStraightAway = [
  {
    where: "Database backups (Supabase)",
    what: "Supabase may keep daily backups of our database. A copy of your account rows, including your email address, can stay in one for up to 7 days, until it is overwritten. We don't restore or use these copies. Your CV files are not in these backups, so they are gone for good.",
  },
  {
    where: "Database logs (Supabase)",
    what: "Supabase logs each request to our database, with your IP address and browser details. These logs are kept for 1 day, and sign-in logs for 1 hour.",
  },
  {
    where: `Hosting logs (Vercel, which runs ${brand.name})`,
    what: "Vercel logs each page request, with your IP address and browser details, for up to 30 days.",
  },
  {
    where: "OpenRouter, which passes your text to the AI model",
    what: "Its terms say it deletes the text of your CV, job ads and answers promptly after the answer is ready. It keeps technical details of each request, such as its size and how long it took, without the text, and does not say for how long. Apart from the text itself, we send it nothing that identifies you, such as your account ID or sign-in email.",
  },
  {
    where: "Records from before you signed in",
    what: `If you used ${brand.name} without an account, a few usage records, such as which button you pressed or how many free checks you used, are kept against a code made from your IP address that changes every day. The address itself is never stored. We can't link these records to you, so they are not deleted with your account. They have no set end date yet.`,
  },
  {
    where: "Other browsers and devices",
    what: `${brand.name}'s data saved in another browser stays there until you sign out there or clear it. If you are still signed in on another device, that sign-in stops working when it expires.`,
  },
] as const;

/**
 * The page after "Delete my account": the action has deleted the account and signed this browser out.
 * Anyone still signed in goes back to the data page, so the browser is cleared only after a deletion.
 * Reads the session, so render it inside <Suspense>.
 */
export async function AccountDeleted() {
  if (!isSupabaseConfigured() || (await getCurrentUser())) redirect("/dashboard/your-data");
  return <AccountDeletedView />;
}

export function AccountDeletedView() {
  return (
    <Page
      title="Your account is deleted"
      description={`We deleted your account, every record linked to it and your CV files, and signed you out. ${brand.name}'s data in this browser is cleared too.`}
    >
      <ClearBrowserData />
      <Card aria-labelledby="not-deleted-title">
        <h2 id="not-deleted-title" className="text-xl">
          What is not deleted straight away
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">
          Some copies and records are kept after you delete your account, by us or by the services we use.
        </p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {notDeletedStraightAway.map((item) => (
            <div key={item.where} className="py-3">
              <dt className="font-semibold">{item.where}</dt>
              <dd className="mt-1 max-w-[65ch] text-text-muted">{item.what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-text-muted">
          Full details are on our{" "}
          <Link href="/privacy#not-deleted-straight-away" className="font-semibold text-accent hover:underline">
            Privacy page
          </Link>
          .
        </p>
      </Card>
      <ButtonLink href="/" className="self-start">
        Back to the home page
      </ButtonLink>
    </Page>
  );
}

export function AccountDeletedFallback() {
  return <main aria-busy="true" className="mx-auto min-h-96 w-full max-w-3xl px-4 py-8 sm:py-12" />;
}
