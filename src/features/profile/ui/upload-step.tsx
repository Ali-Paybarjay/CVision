"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Card, cn, ErrorIcon, Field, Notice } from "@/shared/ui";
import { cvConsent, type ConsentRecord } from "../consent";
import { ACCEPTED_CV_FILES, cvFileMessages, MAX_CV_BYTES } from "../cv-limits";
import type { ExtractResponse } from "../server/extract-request";
import { Steps } from "./steps";

export type ExtractSuccess = Extract<ExtractResponse, { ok: true }>;

type UploadStepProps = {
  /** True when a saved profile exists: uploading replaces it. */
  replacing: boolean;
  /** True while the AI is in mock mode: say so before the upload, not only after it. */
  demoMode: boolean;
  focusHeading: boolean;
  onExtracted: (result: ExtractSuccess, consent: ConsentRecord) => void;
  onCancel?: () => void;
};

type Errors = { file?: string; consent?: string; form?: string; signIn?: boolean };

export function UploadStep({ replacing, demoMode, focusHeading, onExtracted, onCancel }: UploadStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("cv");
    const found: Errors = {};

    if (!(file instanceof File) || file.size === 0) found.file = cvFileMessages.missing;
    else if (file.size > MAX_CV_BYTES) found.file = cvFileMessages.tooLarge;
    else if (!/\.(pdf|docx)$/i.test(file.name)) {
      found.file = /\.doc$/i.test(file.name) ? cvFileMessages.oldWord : cvFileMessages.wrongType;
    }
    if (form.get("consent") !== cvConsent.version) found.consent = "Tick the box to agree, so we can read your CV.";

    setErrors(found);
    if (found.file || found.consent) return;

    setPending(true);
    try {
      const result = await uploadCv(form);
      if (result.ok) {
        onExtracted(result, { version: cvConsent.version, givenAt: new Date().toISOString() });
        return;
      }
      if (result.code === "consent") setErrors({ consent: result.message });
      else if (result.code === "sign-in") setErrors({ signIn: true });
      else setErrors({ form: result.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="upload-heading" className="flex flex-col gap-6">
      <Steps current={0} />
      <h2 id="upload-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
        {replacing ? "Upload a new CV" : "Upload your CV"}
      </h2>

      {demoMode && (
        <Notice tone="warning" title="Demo mode: your CV won’t become your profile yet">
          CVision isn’t connected to the AI yet. It checks that your file can be read, then shows a sample profile
          instead. For a sample person’s own profile, upload their CV from <code>sample-data/cvs</code>.
        </Notice>
      )}

      {replacing && (
        <Notice tone="info" title="This replaces your current profile">
          Your answers to follow-up questions are kept.
        </Notice>
      )}

      <Card>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-busy={pending}>
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

          <fieldset
            className={cn("rounded-md border p-4", errors.consent ? "border-error" : "border-line")}
            aria-describedby={errors.consent ? "consent-error" : undefined}
          >
            <legend className="px-1 text-sm font-semibold">Before we read your CV</legend>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-muted">
              {cvConsent.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="consent"
                value={cvConsent.version}
                disabled={pending}
                aria-invalid={errors.consent ? true : undefined}
                className="mt-0.5 size-5 shrink-0 accent-accent"
              />
              <span className="font-semibold">{cvConsent.label}</span>
            </label>
            {errors.consent && (
              <p id="consent-error" className="mt-2 flex items-center gap-1.5 text-sm text-error">
                <ErrorIcon className="size-4 shrink-0" />
                {errors.consent}
              </p>
            )}
          </fieldset>

          {errors.form && (
            <Notice tone="error" title="We couldn’t read your CV">
              {errors.form}
            </Notice>
          )}
          {errors.signIn && <SignInNotice />}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Reading your CV…" : "Read my CV"}
            </Button>
            {onCancel && (
              <Button variant="quiet" onClick={onCancel} disabled={pending}>
                Keep my current profile
              </Button>
            )}
          </div>
          <p aria-live="polite" className="sr-only">
            {pending ? "Reading your CV. This can take up to a minute." : ""}
          </p>
        </form>
      </Card>
    </section>
  );
}

/**
 * Shown when a step needs a signed-in user: with the AI switched on, each request counts against the user's daily limit.
 * `title` says what signing in is for; the upload's wording is the default.
 */
export function SignInNotice({ title = "Sign in to upload your CV" }: { title?: string }) {
  return (
    <Notice tone="info" title={title}>
      <Link href="/sign-in" className="font-semibold text-accent hover:underline">
        Sign in
      </Link>{" "}
      or{" "}
      <Link href="/sign-up" className="font-semibold text-accent hover:underline">
        create a free account
      </Link>
      , then come back to this page.
    </Notice>
  );
}

async function uploadCv(form: FormData): Promise<ExtractResponse> {
  try {
    const response = await fetch("/profile/extract", { method: "POST", body: form });
    return (await response.json()) as ExtractResponse;
  } catch {
    return { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
  }
}
