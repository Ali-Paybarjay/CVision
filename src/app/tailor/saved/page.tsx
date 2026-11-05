import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/account/current-user";
import { withNext } from "@/features/account/safe-redirect";
import { savedCvLayout } from "@/features/tailor/saved-cv";
import { getMyJob } from "@/features/tailor/server/my-data";
import { getMyTailoredCv } from "@/features/tailor/server/tailored-cvs";
import { ButtonLink, CvPaper, Notice, Page } from "@/shared/ui";
import { CvPreview } from "../cv-preview";
import { SavedDownloads } from "./saved-downloads";

export const metadata: Metadata = { title: "The CV and cover letter you sent" };

const description = "Exactly what you downloaded or sent with Apply, kept as it was, even if your profile has changed since.";

// /tailor/saved?job=<id>: the CV and cover letter saved with the last download or Apply for one job (#207).
// Read only, and it never asks the model anything. The dashboard's "CV and cover letter" link (#208, Ali) opens it.
export default function SavedTailoredCvPage({ searchParams }: PageProps<"/tailor/saved">) {
  return (
    <Page title="The CV and cover letter you sent" description={description}>
      <Suspense fallback={<p className="text-text-muted">Loading what you sent…</p>}>
        <SavedView searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

const savedDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));

async function SavedView({ searchParams }: Pick<PageProps<"/tailor/saved">, "searchParams">) {
  const requested = (await searchParams).job;
  const jobId = typeof requested === "string" ? requested : "";
  const here = `/tailor/saved?job=${encodeURIComponent(jobId)}`;

  if (!(await getCurrentUser())) {
    return (
      <Notice tone="info" title="Sign in to see what you sent">
        We keep the CV and cover letter you send in your account.{" "}
        <Link href={withNext("/sign-in", here)} className="text-accent underline">
          Sign in
        </Link>
      </Notice>
    );
  }

  const [job, saved] = await Promise.all([getMyJob(jobId), getMyTailoredCv(jobId)]);
  if (!job || !saved) {
    return (
      <>
        <Notice tone="info" title="Nothing saved for this job yet">
          We keep your CV and cover letter when you download them or press Apply on the Tailor page.
        </Notice>
        <div>
          <ButtonLink href={job ? `/tailor?job=${encodeURIComponent(job.id)}` : "/dashboard"}>{job ? "Tailor your CV for this job" : "Go to your dashboard"}</ButtonLink>
        </div>
      </>
    );
  }

  const paragraphs = saved.coverLetter?.split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean) ?? [];
  return (
    <>
      <p className="text-lg">
        <span className="font-semibold">{job.title}</span> at {job.company}
        <span className="block text-sm text-text-muted">
          Saved on <time dateTime={saved.savedAt}>{savedDate(saved.savedAt)}</time>
        </span>
      </p>

      <section aria-labelledby="sent-cv-heading" className="flex flex-col gap-3">
        <h2 id="sent-cv-heading" className="text-xl">
          Your CV
        </h2>
        <CvPreview cv={savedCvLayout(saved, job)} />
      </section>

      <section aria-labelledby="sent-letter-heading" className="flex flex-col gap-3">
        <h2 id="sent-letter-heading" className="text-xl">
          Your cover letter
        </h2>
        {paragraphs.length > 0 ? (
          <CvPaper aria-label="Your cover letter" className="flex flex-col gap-3 text-sm leading-relaxed">
            {paragraphs.map((text, index) => (
              <p key={index} className="whitespace-pre-line">
                {text}
              </p>
            ))}
          </CvPaper>
        ) : (
          <p className="text-text-muted">You had not approved a cover letter when you sent this CV.</p>
        )}
      </section>

      <SavedDownloads jobId={job.id} hasLetter={paragraphs.length > 0} />

      <div>
        <ButtonLink href={`/tailor?job=${encodeURIComponent(job.id)}`} variant="quiet">
          Open this job in Tailor
        </ButtonLink>
      </div>
    </>
  );
}
