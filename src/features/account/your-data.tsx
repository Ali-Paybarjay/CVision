import { brand } from "@/shared/brand";
import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Button, ButtonLink, Card, Notice } from "@/shared/ui";
import { accountsOffNotice } from "./account-panel";
import { BrowserDataDownload } from "./browser-data-download";
import { getCurrentUser } from "./current-user";
import { summariseUserData, userTables, type DataSummary, type UserTable } from "./data-rights";
import { downloadPath, yourDataPath } from "./data-rights-paths";
import { DeleteAccountForm } from "./delete-account-form";
import { withNext } from "./safe-redirect";

const tableLabels: Record<UserTable, { label: string; detail: string }> = {
  profiles: { label: "Profile", detail: "Your approved profile, from your CV or the details you typed in, and your answers." },
  jobs: { label: "Saved job ads", detail: "The job ads you pasted." },
  match_results: { label: "Match results", detail: "How well your experience fits each job." },
  tailoring_changes: { label: "Suggested CV changes", detail: "Each tailored line, and whether you approved it." },
  tailored_cvs: { label: "Saved tailored CVs", detail: "The CV and cover letter you approved for each job." },
  interview_sessions: { label: "Interview practice", detail: "The questions, your answers and the feedback." },
  applications: { label: "Applications", detail: "Your tracker: the status and next step for each job." },
  events: { label: "Usage records", detail: "Which features you used, such as finishing a practice interview. Never your CV or answers." },
  ai_usage: { label: "AI usage records", detail: "One per AI request, for daily limits: which feature, and how much text. Never the text itself." },
};

/**
 * The data-rights page (issue #43): what we hold about the signed-in user, Download my data, then Delete my account.
 * Reads the session, so render it inside <Suspense>.
 */
export async function YourData({ downloadFailed }: { downloadFailed: boolean }) {
  if (!isSupabaseConfigured()) return accountsOffNotice;

  const user = await getCurrentUser();
  if (!user) return <SignInToSeeYourData />;

  const result = await summariseUserData(user.id);
  if (!result.ok) {
    return result.reason === "not-connected" ? (
      <Notice tone="info" title="Download and deletion are not switched on yet">
        Your account and data are unchanged. Try again later.
      </Notice>
    ) : (
      <Notice tone="error" title="We could not load your data">
        Nothing was changed. Refresh the page to try again.
      </Notice>
    );
  }

  return <DataRightsView email={user.email} summary={result.summary} downloadFailed={downloadFailed} />;
}

/** The page once the summary is in: what we hold, Download my data, Delete my account. */
export function DataRightsView({ email, summary, downloadFailed }: { email: string | null; summary: DataSummary; downloadFailed: boolean }) {
  return (
    <>
      {downloadFailed && (
        <Notice tone="error" title="We could not prepare your download">
          Nothing was downloaded. Try again in a moment.
        </Notice>
      )}

      <Card aria-labelledby="held-title">
        <h2 id="held-title" className="text-xl">
          What we hold about you
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">
          Your account
          {email && (
            <>
              {" "}
              (<span className="font-semibold text-text wrap-anywhere">{email}</span>)
            </>
          )}{" "}
          and these records. Download them all, or delete them with your account.
        </p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {userTables.map((table) => (
            <SummaryRow key={table} label={tableLabels[table].label} detail={tableLabels[table].detail} count={summary.rows[table]} />
          ))}
          <SummaryRow label="CV files" detail="The CV files you uploaded, as they were." count={summary.cvFiles} />
        </dl>
      </Card>

      <Card aria-labelledby="download-title">
        <h2 id="download-title" className="text-xl">
          Download my data
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">
          One ZIP file with everything listed above: your account’s details and records in data.json, and your
          original CV files. data.json also lists what it leaves out, such as the IP address and browser details kept
          for each device you sign in on.
        </p>
        {/* A plain form post, not a link: a link could be prefetched, and the download is built fresh each time. */}
        <form action={downloadPath} method="post" className="mt-5">
          <Button type="submit" variant="primary">
            Download my data
          </Button>
        </form>
        <BrowserDataDownload />
      </Card>

      <Card aria-labelledby="delete-title">
        <DeleteAccountForm />
      </Card>
    </>
  );
}

function SummaryRow({ label, detail, count }: { label: string; detail: string; count: number }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt>
        <span className="font-semibold">{label}</span>
        <span className="block text-sm text-text-muted">{detail}</span>
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{count}</dd>
    </div>
  );
}

function SignInToSeeYourData() {
  return (
    <Card>
      <h2 className="text-xl">Sign in to download or delete your data</h2>
      <p className="mt-1 max-w-[65ch] text-text-muted">
        Once you are signed in, you can download what {brand.name} holds about your account, or delete it for good.
      </p>
      <ButtonLink href={withNext("/sign-in", yourDataPath)} variant="primary" className="mt-5">
        Sign in
      </ButtonLink>
    </Card>
  );
}

export function YourDataFallback() {
  return <Card aria-busy="true" className="h-96" />;
}
