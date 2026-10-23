"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/shared/contracts";
import { ButtonLink, Button, Card, Field, Input, Notice, Textarea } from "@/shared/ui";
import { checkJobAction, type CheckJobResult } from "../job-actions";
import { checkAdText, MAX_AD_CHARACTERS, parseAdUrl } from "../job-extraction";
import { useStoredProfile } from "../profile-store";
import { BackLink } from "./back-link";
import { MatchReport } from "./match-report";
import { SignInNotice } from "./upload-step";

type CheckJobSuccess = Extract<CheckJobResult, { ok: true }>;

/** What the user pasted, so Back from the report shows it again. */
export type AdInput = { ad: string; url: string };

type View = { name: "form"; input: AdInput | null } | { name: "report"; result: CheckJobSuccess; input: AdInput };

/** Where Back goes from this page when the page before it isn't on this site: the profile, the step before. */
const PAGE_BACK = "/profile";

/**
 * Where the profile to compare with comes from: the signed-in user's account (read on the server), this browser
 * when accounts are not switched on, or nowhere for a signed-out visitor.
 */
export type JobProfileSource = { kind: "account"; profile: Profile | null } | { kind: "browser" } | { kind: "signed-out" };

/**
 * The jobs page: paste an ad (and its link, if the user has one), then see the match report.
 * The ad is compared with the profile the user approved on /profile. Back on the report returns to the ad as pasted.
 * `demoMode` is true while the AI is in mock mode, so the page can say so before the check.
 */
export function JobChecker({ demoMode, source = { kind: "browser" } }: { demoMode: boolean; source?: JobProfileSource }) {
  const stored = useStoredProfile();
  const [view, setView] = useState<View>({ name: "form", input: null });
  // Focus moves to each new view, but not on the first page load.
  const [navigated, setNavigated] = useState(false);

  const show = (next: View) => {
    setView(next);
    setNavigated(true);
  };

  let profile: Profile | null | undefined;
  if (source.kind === "account") profile = source.profile;
  else if (source.kind === "signed-out") profile = null;
  else profile = stored === undefined ? undefined : (stored?.profile ?? null);

  let back = <BackLink href={PAGE_BACK} />;
  let content: React.ReactNode;
  if (profile === undefined) {
    content = (
      <Card aria-busy="true">
        <p className="text-text-muted">Loading your profile…</p>
      </Card>
    );
  } else if (view.name === "report") {
    const { job, match, saved, demo } = view.result;
    const { input } = view;
    back = <BackLink onClick={() => show({ name: "form", input })} />;
    content = (
      <MatchReport
        job={job}
        match={match}
        saved={saved}
        demo={demo}
        focusHeading={navigated}
        onCheckAnother={() => show({ name: "form", input: null })}
      />
    );
  } else if (source.kind === "signed-out" && !demoMode) {
    // In the demo a signed-out visitor can try it with a sample profile; otherwise they sign in first.
    content = <SignInNotice title="Sign in to check a job against your profile" />;
  } else if (!profile && !demoMode) {
    content = <ProfileFirst />;
  } else {
    content = (
      <JobForm
        profile={profile}
        demoMode={demoMode}
        initial={view.input}
        focusAd={navigated}
        onChecked={(result, input) => show({ name: "report", result, input })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {back}
      {content}
    </div>
  );
}

type Errors = { ad?: string; url?: string; form?: string; signIn?: boolean };

type JobFormProps = {
  /** The user's approved profile; null only in demo mode, where a sample profile is used instead. */
  profile: Profile | null;
  demoMode: boolean;
  /** The ad and link to show again, after Back from the report. */
  initial?: AdInput | null;
  /** Moves focus to the ad box, after Back or "Check another job". */
  focusAd: boolean;
  onChecked: (result: CheckJobSuccess, input: AdInput) => void;
};

export function JobForm({ profile, demoMode, initial, focusAd, onChecked }: JobFormProps) {
  // The shared Input and Textarea take no ref, so fields are found by name inside the form.
  const formRef = useRef<HTMLFormElement>(null);
  const focusField = (name: "ad" | "url") => formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (focusAd) formRef.current?.querySelector<HTMLElement>('[name="ad"]')?.focus();
  }, [focusAd]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ad = checkAdText(form.get("ad"));
    const url = parseAdUrl(form.get("url"));
    const found: Errors = { ad: ad.ok ? undefined : ad.message, url: url.ok ? undefined : url.message };

    setErrors(found);
    if (found.ad || found.url) {
      focusField(found.ad ? "ad" : "url");
      return;
    }

    setPending(true);
    try {
      let result: CheckJobResult;
      try {
        result = await checkJobAction({ ad: form.get("ad"), url: form.get("url"), profile });
      } catch {
        result = { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
      }
      if (result.ok) {
        onChecked(result, { ad: String(form.get("ad") ?? ""), url: String(form.get("url") ?? "") });
        return;
      }
      if (result.code === "ad") setErrors({ ad: result.message });
      else if (result.code === "url") setErrors({ url: result.message });
      else if (result.code === "sign-in") setErrors({ signIn: true });
      else setErrors({ form: result.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Check a job ad" className="flex flex-col gap-6">
      {demoMode && (
        <Notice tone="warning" title="Demo mode: the match uses sample data">
          CVision isn’t connected to the AI yet. It reads your ad as one of the sample jobs and matches it by looking for
          the ad’s words in the profile. To see a sample job’s own details, paste its ad from{" "}
          <code>sample-data/personas</code>.{" "}
          {!profile && "You have no profile yet, so the match uses the sample person’s profile."}
        </Notice>
      )}

      <Card>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-busy={pending}>
          <Field
            label="The job ad"
            hint="Paste the whole ad: the job title, what you would do and what the employer asks for."
            error={errors.ad}
          >
            {(props) => (
              <Textarea
                {...props}
                name="ad"
                rows={12}
                maxLength={MAX_AD_CHARACTERS}
                defaultValue={initial?.ad}
                disabled={pending}
                className="min-h-64"
              />
            )}
          </Field>

          <Field
            label="Link to the ad (optional)"
            hint="We keep it so you can open the employer’s own page when you apply."
            error={errors.url}
          >
            {(props) => (
              <Input
                {...props}
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://"
                defaultValue={initial?.url}
                disabled={pending}
              />
            )}
          </Field>

          {profile && (
            <p className="text-sm text-text-muted">
              We compare the ad with the profile you approved for {profile.fullName}. Nothing is added to it.
            </p>
          )}

          {errors.form && (
            <Notice tone="error" title="We couldn’t check this job">
              {errors.form}
            </Notice>
          )}
          {errors.signIn && <SignInNotice title="Sign in to check a job" />}

          <div>
            <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Checking your fit…" : "Check my fit"}
            </Button>
          </div>
          <p aria-live="polite" className="sr-only">
            {pending ? "Reading the ad and checking your fit. This can take up to a minute." : ""}
          </p>
        </form>
      </Card>
    </section>
  );
}

/** Shown instead of the form when there is no profile to compare the ad with. */
export function ProfileFirst() {
  return (
    <Card>
      <h2 className="text-xl">Your profile comes first</h2>
      <p className="mt-2 max-w-[65ch] text-text-muted">
        We compare each job ad with the profile you approved, so the match only uses what you told us. Upload your CV
        to build it.
      </p>
      <ButtonLink href="/profile" variant="primary" className="mt-4">
        Upload your CV
      </ButtonLink>
    </Card>
  );
}
