"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { withNext } from "@/features/account/safe-redirect";
import { Button, Card, Field, Notice } from "@/shared/ui";
import { consentPoints, cvConsent, type ConsentRecord, type ProfileStorageKind } from "../consent";
import { ACCEPTED_CV_FILES, cvFileMessages, MAX_CV_BYTES } from "../cv-limits";
import type { ExtractResponse } from "../server/extract-request";
import { ConsentBox } from "./consent-box";
import { useFocusHeading } from "./focus-heading";
import { Steps } from "./steps";

export type ExtractSuccess = Extract<ExtractResponse, { ok: true }>;

type UploadStepProps = {
  /** True when a saved profile exists: uploading replaces it. */
  replacing: boolean;
  /** True when that profile came from a CV, so this one is a new CV. A profile typed in by hand had none. */
  newCv?: boolean;
  /** True while the AI is in mock mode: say so before the upload, not only after it. */
  demoMode: boolean;
  /** Where the approved profile will be kept, so the consent says so. */
  storage: ProfileStorageKind;
  focusHeading: boolean;
  /** `file` is the uploaded CV, kept in the page until the user approves their profile. */
  onExtracted: (result: ExtractSuccess, consent: ConsentRecord, file: File) => void;
  /** Offers to type the details in by hand instead, for someone with no CV to upload. */
  onStartManual?: () => void;
  onCancel?: () => void;
};

type Errors = { file?: string; consent?: string; form?: string; signIn?: boolean };

export function UploadStep({
  replacing,
  newCv = false,
  demoMode,
  storage,
  focusHeading,
  onExtracted,
  onStartManual,
  onCancel,
}: UploadStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  useFocusHeading(headingRef, focusHeading);

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
        onExtracted(result, { version: cvConsent.version, givenAt: new Date().toISOString() }, file as File);
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
        {newCv ? "Upload a new CV" : "Upload your CV"}
      </h2>

      {demoMode && (
        <Notice tone="warning" title="Demo mode: your CV won’t become your profile yet">
          CVision isn’t connected to the AI yet. It checks that your file can be read, then shows a sample profile
          instead. For a sample person’s own profile, upload their CV from <code>sample-data/cvs</code>.
        </Notice>
      )}

      {replacing && (
        <Notice tone="info" title="This replaces your current profile">
          Nothing changes until you check the new details and approve them.
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

          <ConsentBox
            legend="Before we read your CV"
            points={consentPoints(storage)}
            label={cvConsent.label}
            error={errors.consent}
            input={{ name: "consent", value: cvConsent.version, disabled: pending }}
          />

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

      {onStartManual && (
        <Card aria-labelledby="manual-heading">
          <h3 id="manual-heading" className="text-xl">
            No CV to upload?
          </h3>
          <p className="mt-2 text-text-muted">
            Fill in your details yourself instead: your work history, education, certificates and skills. Nothing is
            saved until you approve it.
          </p>
          <Button className="mt-4" onClick={onStartManual} disabled={pending}>
            Fill in my details
          </Button>
        </Card>
      )}
    </section>
  );
}

/**
 * Shown when a step needs a signed-in user: with the AI switched on, each request counts against the user's daily limit.
 * `title` says what signing in is for; the upload's wording is the default. `next` is the page the user comes back to.
 */
export function SignInNotice({ title = "Sign in to upload your CV", next = "/profile" }: { title?: string; next?: string }) {
  return (
    <Notice tone="info" title={title}>
      <Link href={withNext("/sign-in", next)} className="font-semibold text-accent hover:underline">
        Sign in
      </Link>{" "}
      or{" "}
      <Link href={withNext("/sign-up", next)} className="font-semibold text-accent hover:underline">
        create a free account
      </Link>
      , and you’ll come back to this page.
    </Notice>
  );
}

/**
 * Sends the CV to POST /profile/extract. Never throws: a lost connection, and an answer that isn't ours (the host
 * stopping a request that ran out of time, for example), each come back as a message the user can act on.
 */
export async function uploadCv(form: FormData): Promise<ExtractResponse> {
  let response: Response;
  try {
    response = await fetch("/profile/extract", { method: "POST", body: form });
  } catch {
    return { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
  }
  const body: unknown = await response.json().catch(() => null);
  if (body !== null && typeof body === "object" && "ok" in body && typeof body.ok === "boolean") {
    return body as ExtractResponse;
  }
  if (response.status === 413) return { ok: false, code: "too-large", message: cvFileMessages.tooLarge };
  if (response.status === 504) {
    return { ok: false, code: "ai-unavailable", message: "Reading your CV took too long. Try again in a minute." };
  }
  return { ok: false, code: "ai-unavailable", message: "Something went wrong on our side. Try again in a minute." };
}
