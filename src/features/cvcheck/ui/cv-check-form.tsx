"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/shared/brand";
import type { CvCheckResult, CvIssue } from "@/shared/contracts";
import { Button, ButtonLink, Card, cn, Field, Notice, Textarea } from "@/shared/ui";
import { ACCEPTED_CV_FILES, cvFileMessages, MAX_CV_BYTES } from "@/features/profile/cv-limits";
import type { CvCheckResponse } from "../server/check-request";

type Source = "file" | "text";
type Errors = { file?: string; text?: string; form?: string; limit?: string };
type Checked = { result: CvCheckResult; truncated: boolean };

/** The free CV check: upload or paste, check, then the result and the one invitation to sign up. */
export function CvCheckForm({ demoMode }: { demoMode: boolean }) {
  const [source, setSource] = useState<Source>("file");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<Checked | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const found: Errors = {};

    if (source === "file") {
      form.delete("cvText");
      const file = form.get("cv");
      if (!(file instanceof File) || file.size === 0) found.file = cvFileMessages.missing;
      else if (file.size > MAX_CV_BYTES) found.file = cvFileMessages.tooLarge;
      else if (!/\.(pdf|docx)$/i.test(file.name)) {
        found.file = /\.doc$/i.test(file.name) ? cvFileMessages.oldWord : cvFileMessages.wrongType;
      }
    } else {
      form.delete("cv");
      if (String(form.get("cvText") ?? "").trim() === "") found.text = "Paste the text of your CV.";
    }

    setErrors(found);
    if (found.file || found.text) return;

    setPending(true);
    try {
      const response = await sendCv(form);
      if (response.ok) {
        setChecked({ result: response.result, truncated: response.truncated });
        return;
      }
      if (response.code === "limit-reached") setErrors({ limit: response.message });
      else if (source === "text" && (response.code === "too-short" || response.code === "too-long")) setErrors({ text: response.message });
      else if (source === "file" && response.code !== "ai-failed" && response.code !== "ai-busy" && response.code !== "ai-unavailable") {
        setErrors({ file: response.message });
      } else setErrors({ form: response.message });
    } finally {
      setPending(false);
    }
  }

  if (checked) {
    return <CvCheckReport {...checked} demoMode={demoMode} onCheckAnother={() => setChecked(null)} />;
  }

  return (
    <>
      {demoMode && (
        <Notice tone="warning" title="Demo mode: this is a sample result">
          CVision isn’t connected to the AI yet. It checks that your CV can be read, then shows the same sample result for
          every CV.
        </Notice>
      )}

      <Card>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-busy={pending}>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-semibold">How do you want to share your CV?</legend>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["file", "Upload a file"],
                  ["text", "Paste the text"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-semibold",
                    source === value ? "border-accent bg-fit text-accent" : "border-line text-text",
                  )}
                >
                  <input
                    type="radio"
                    name="source"
                    value={value}
                    checked={source === value}
                    onChange={() => {
                      setSource(value);
                      setErrors({});
                    }}
                    disabled={pending}
                    className="size-4 accent-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {source === "file" ? (
            <Field label="Your CV" hint="A PDF or a Word (.docx) file, up to 4 MB." error={errors.file}>
              {(props) => (
                <input
                  {...props}
                  type="file"
                  name="cv"
                  accept={ACCEPTED_CV_FILES}
                  disabled={pending}
                  className="w-full rounded-md border border-text-muted bg-surface p-2 text-base text-text file:mr-4 file:min-h-10 file:cursor-pointer file:rounded-md file:border-0 file:bg-fit file:px-4 file:font-semibold file:text-accent aria-invalid:border-error"
                />
              )}
            </Field>
          ) : (
            <Field label="Your CV" hint="Copy all of it, from your name to your education, and paste it here." error={errors.text}>
              {(props) => <Textarea {...props} name="cvText" rows={12} disabled={pending} className="min-h-64" />}
            </Field>
          )}

          <p className="text-sm text-text-muted">
            We don’t save your CV, its text or the result, and you don’t need an account. To check it, we send the text to
            our AI provider.
          </p>

          {errors.form && (
            <Notice tone="error" title="We couldn’t check your CV">
              {errors.form}
            </Notice>
          )}
          {errors.limit && (
            <Notice tone="info" title="No free checks left today">
              {errors.limit}{" "}
              <Link href="/sign-up" className="font-semibold text-accent hover:underline">
                Create a free account
              </Link>
            </Notice>
          )}

          {/* Secondary on purpose: Get started free, under the result, is the page's one Coral button. */}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Checking your CV…" : "Check my CV"}
            </Button>
          </div>
          <p aria-live="polite" className="sr-only">
            {pending ? "Checking your CV. This can take up to a minute." : ""}
          </p>
        </form>
      </Card>
    </>
  );
}

const readinessLabels: Record<CvCheckResult["readiness"], string> = {
  ready: "Ready for UK employers",
  "nearly-ready": "Nearly ready",
  "not-ready": "Not ready yet",
};

const severityLabels: Record<CvIssue["severity"], string> = {
  high: "Fix first",
  medium: "Worth fixing",
  low: "Polish",
};

function CvCheckReport({
  result,
  truncated,
  demoMode,
  onCheckAnother,
}: Checked & { demoMode: boolean; onCheckAnother: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="result-heading" className="flex flex-col gap-6">
      {demoMode && (
        <Notice tone="warning" title="Demo mode: this is a sample result">
          The AI isn’t connected yet, so this is not a check of your CV.
        </Notice>
      )}
      {truncated && (
        <Notice tone="info" title="We checked the start of your CV">
          Your CV is very long, so we read only the first part. UK employers expect two pages at most.
        </Notice>
      )}

      <Card className="flex flex-col gap-4">
        <h2 id="result-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
          {readinessLabels[result.readiness]}
        </h2>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-muted">
            <span className="text-3xl font-bold text-text">{result.score}</span> out of 100
          </p>
          <div
            role="meter"
            aria-label="Readiness score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={result.score}
            className="h-2 w-full overflow-hidden rounded-full bg-fit"
          >
            <div className="h-full rounded-full bg-fit-bar" style={{ width: `${result.score}%` }} />
          </div>
        </div>
        <p className="text-lg">{result.summary}</p>
      </Card>

      {result.issues.length > 0 && (
        <section aria-labelledby="issues-heading" className="flex flex-col gap-4">
          <h3 id="issues-heading" className="text-xl">
            What to fix
          </h3>
          <ol className="flex flex-col gap-4">
            {result.issues.map((issue) => (
              <li key={issue.id}>
                <Card as="article" className="flex flex-col gap-2">
                  <p
                    className={cn(
                      "w-fit rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                      issue.severity === "high" ? "bg-warning-bg text-warning" : "bg-fit text-accent",
                    )}
                  >
                    {severityLabels[issue.severity]}
                  </p>
                  <h4 className="text-lg font-semibold">{issue.title}</h4>
                  <p>{issue.explanation}</p>
                  <p>
                    <span className="font-semibold">How to fix it: </span>
                    {issue.fix}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Card className="flex flex-col items-start gap-3">
        <h3 className="text-xl">Next: make it fit each job</h3>
        <p className="text-text-muted">
          Upload your CV once, paste a job ad, and get a tailored CV and cover letter built only from what you’ve told us.
        </p>
        <ButtonLink href="/sign-up" variant="primary">
          {brand.cta.primary}
        </ButtonLink>
      </Card>

      <div>
        <Button variant="quiet" onClick={onCheckAnother}>
          Check another CV
        </Button>
      </div>
    </section>
  );
}

async function sendCv(form: FormData): Promise<CvCheckResponse> {
  try {
    const response = await fetch("/cv-check/api", { method: "POST", body: form });
    return (await response.json()) as CvCheckResponse;
  } catch {
    return { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
  }
}
