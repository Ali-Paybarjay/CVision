"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Profile } from "@/shared/contracts";
import { ButtonLink, Button, Card, cn, Field, Input, Notice, Textarea, WaitNote } from "@/shared/ui";
import { checkJobAction, readAdLinkAction, type CheckJobResult, type ReadAdLinkResult } from "../job-actions";
import { checkAdText, MAX_AD_CHARACTERS, parseAdUrl } from "../job-extraction";
import { useStoredProfile } from "../profile-store";
import { BackLink } from "./back-link";
import { MatchReport } from "./match-report";
import { SignInToStart } from "./sign-in-to-start";
import { SignInNotice } from "./upload-step";

type CheckJobSuccess = Extract<CheckJobResult, { ok: true }>;

/** How the user gives the ad: its link, which we read for them, or its text (#330). */
export type AdSource = "link" | "text";

/** What the user gave, so Back from the report shows it again. */
export type AdInput = { source: AdSource; ad: string; url: string };

/**
 * What the last "Get the ad" found: the ad, or why there is none. "restored" is the ad as it was before the report.
 * The ad box shows once there is one, and a changed link hides it again until the user gets the ad from that link.
 */
type LinkOutcome = { kind: "read"; site: string; tooLong: boolean } | { kind: "unreadable"; message: string } | { kind: "restored" };

type View = { name: "form"; input: AdInput | null } | { name: "report"; result: CheckJobSuccess; input: AdInput };

/** Where Back goes from this page when the page before it isn't on this site: the profile, the step before. */
const PAGE_BACK = "/profile";

/** The check can take up to two minutes (the page's maxDuration), so after a minute the wait says so. */
const SLOW_AFTER_MS = 60_000;

/**
 * Where the profile to compare with comes from: the signed-in user's account (read on the server), this browser
 * when accounts are not switched on, or nowhere for a signed-out visitor.
 */
export type JobProfileSource = { kind: "account"; profile: Profile | null } | { kind: "browser" } | { kind: "signed-out" };

/**
 * The jobs page: give the ad's link or paste its text, then see the match report.
 * The ad is compared with the profile the user approved on /profile. Back on the report returns to the ad as given.
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
    // In the demo a signed-out visitor can try it with a sample profile; otherwise they sign in first, with the same
    // card as the profile page and a Coral button, and come back here afterwards.
    content = (
      <SignInToStart
        title="Sign in to check a job against your profile"
        text="We compare each job ad with the profile in your CVision account, so the match only uses what you told us. You’ll come back to this page afterwards."
        next="/jobs"
        back={false}
      />
    );
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
  /** Moves focus to the ad's link or its text, after Back or "Check another job". */
  focusAd: boolean;
  onChecked: (result: CheckJobSuccess, input: AdInput) => void;
};

/** "Get the ad" opens the page within 10 seconds (fetchPublicPage), plus the time to reach our server. */
const readingLinkNote = "Opening the page and copying the ad. This can take up to 15 seconds.";

export function JobForm({ profile, demoMode, initial, focusAd, onChecked }: JobFormProps) {
  // The shared Input and Textarea take no ref, so fields are found by name inside the form.
  const formRef = useRef<HTMLFormElement>(null);
  const focusField = (name: "ad" | "url") => formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
  const [source, setSource] = useState<AdSource>(initial?.source ?? "link");
  const [url, setUrl] = useState(initial?.url ?? "");
  // Each way keeps its own ad, so one never brings the other's back: the ad from the link (read, or pasted when it
  // couldn't be read), and the pasted ad.
  const [linkAd, setLinkAd] = useState(initial?.source === "link" ? initial.ad : "");
  const [pastedAd, setPastedAd] = useState(initial?.source === "text" ? initial.ad : "");
  const ad = source === "link" ? linkAd : pastedAd;
  const setAd = source === "link" ? setLinkAd : setPastedAd;
  const [fromLink, setFromLink] = useState<LinkOutcome | null>(
    initial?.source === "link" && initial.ad !== "" ? { kind: "restored" } : null,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const busy = reading || pending;
  // With a link, the ad box waits for "Get the ad"; with text, it is the whole form.
  const showAd = source === "text" || fromLink !== null;

  // What "Get the ad" found appears with the ad box below it. Focus goes to that message, so a screen reader reads
  // it (a status added to the page is often not read) and a phone scrolls to it, without opening the keyboard.
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The ad box when it shows, otherwise the link.
    const form = formRef.current;
    if (focusAd) (form?.querySelector<HTMLElement>('[name="ad"]') ?? form?.querySelector<HTMLElement>('[name="url"]'))?.focus();
  }, [focusAd]);

  useEffect(() => {
    if (fromLink?.kind === "read" || fromLink?.kind === "unreadable") outcomeRef.current?.focus();
  }, [fromLink]);

  function chooseSource(next: AdSource) {
    setSource(next);
    setErrors({});
  }

  function changeLink(value: string) {
    setUrl(value);
    // The ad in the box belongs to the old link: the new one is read first, and if it can't be, the box comes back
    // empty rather than with the old job's ad.
    if (fromLink) {
      setFromLink(null);
      setLinkAd("");
    }
  }

  async function readLink() {
    const checked = parseAdUrl(url);
    const problem = !checked.ok ? checked.message : checked.url === null ? "Paste the link to the ad first." : null;
    if (problem) {
      setErrors({ url: problem });
      focusField("url");
      return;
    }

    setErrors({});
    setReading(true);
    try {
      let result: ReadAdLinkResult;
      try {
        result = await readAdLinkAction({ url });
      } catch {
        // Nothing is wrong with the link, so the message goes where every other failure does, with the box for the ad.
        result = {
          ok: false,
          code: "unreadable",
          message: "We couldn’t reach CVision. Check your connection and try again, or paste the ad below.",
        };
      }
      if (result.ok) {
        setLinkAd(result.text);
        setFromLink({ kind: "read", site: result.site, tooLong: result.tooLong });
      } else if (result.code === "unreadable") {
        setFromLink({ kind: "unreadable", message: result.message });
      } else if (result.code === "sign-in") {
        setErrors({ signIn: true });
      } else {
        const { message } = result;
        // The link box is disabled while reading, and a disabled box can't take focus: enable it first.
        flushSync(() => {
          setErrors({ url: message });
          setReading(false);
        });
        focusField("url");
      }
    } finally {
      setReading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // "Get the ad" is the form's own button until there is an ad to check.
    if (!showAd) {
      await readLink();
      return;
    }

    // The link goes with the ad only when the user chose to give it; with text, the ad is all there is.
    const link = source === "link" ? url : "";
    const checkedAd = checkAdText(ad);
    const checkedUrl = parseAdUrl(link);
    const found: Errors = {
      ad: checkedAd.ok ? undefined : checkedAd.message,
      url: checkedUrl.ok ? undefined : checkedUrl.message,
    };

    setErrors(found);
    if (found.ad || found.url) {
      focusField(found.ad ? "ad" : "url");
      return;
    }

    setPending(true);
    const slowNote = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    try {
      let result: CheckJobResult;
      try {
        result = await checkJobAction({ ad, url: link, profile });
      } catch {
        result = { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
      }
      if (result.ok) {
        onChecked(result, { source, ad, url });
        return;
      }
      if (result.code === "ad") setErrors({ ad: result.message });
      else if (result.code === "url") setErrors({ url: result.message });
      else if (result.code === "sign-in") setErrors({ signIn: true });
      else setErrors({ form: result.message });
    } finally {
      window.clearTimeout(slowNote);
      setSlow(false);
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
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-busy={busy}>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-semibold">How do you want to share the ad?</legend>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["link", "Paste the link"],
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
                    onChange={() => chooseSource(value)}
                    disabled={busy}
                    className="size-4 accent-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {source === "link" && (
            <div className="flex flex-col gap-3">
              <Field
                label="Link to the ad"
                hint="We copy the ad from the page, and you check it before we compare it with your profile. Indeed and LinkedIn don’t let other websites open their job ads, so paste the text for those."
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
                    value={url}
                    onChange={(event) => changeLink(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter here gets the ad, even once the ad box shows: the user asks for the check themselves.
                      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      void readLink();
                    }}
                    disabled={busy}
                  />
                )}
              </Field>
              <div>
                {/* The one Coral button until the ad is in; then "Check my fit" is, and this reads a link again. */}
                <Button
                  type={showAd ? "button" : "submit"}
                  variant={showAd ? "secondary" : "primary"}
                  onClick={showAd ? readLink : undefined}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  {reading ? "Getting the ad…" : "Get the ad"}
                </Button>
                <WaitNote className="mt-3">{reading && readingLinkNote}</WaitNote>
              </div>
            </div>
          )}

          {source === "link" && (fromLink?.kind === "read" || fromLink?.kind === "unreadable") && (
            <div ref={outcomeRef} tabIndex={-1} className="outline-none">
              {fromLink.kind === "read" ? (
                // "The text", not "the ad": a page can open without the ad on it, which only the user can tell.
                <Notice tone={fromLink.tooLong ? "warning" : "success"} title={`We copied the text from ${fromLink.site}`}>
                  {fromLink.tooLong &&
                    "The page had more text than a job ad has. Delete everything that isn’t part of the ad, then check your fit."}
                </Notice>
              ) : (
                <Notice tone="warning" title="We couldn’t read the ad from this link">
                  {fromLink.message}
                </Notice>
              )}
            </div>
          )}

          {showAd && (
            <Field
              label="The job ad"
              hint={
                source === "link" && fromLink?.kind !== "unreadable"
                  ? "Check it’s the job ad, and all of it, and delete anything else, such as menus or other jobs. If the ad isn’t there, copy it from the page and paste it here instead."
                  : "Paste the whole ad: the job title, what you would do and what the employer asks for."
              }
              error={errors.ad}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="ad"
                  rows={12}
                  maxLength={MAX_AD_CHARACTERS}
                  value={ad}
                  onChange={(event) => setAd(event.target.value)}
                  disabled={busy}
                  className="min-h-64"
                />
              )}
            </Field>
          )}

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
          {errors.signIn && <SignInNotice title="Sign in to check a job" next="/jobs" />}

          {showAd && (
            <div>
              <Button type="submit" variant="primary" disabled={busy} className="w-full sm:w-auto">
                {pending ? "Checking your fit…" : "Check my fit"}
              </Button>
              <WaitNote className="mt-3">
                {pending &&
                  (slow
                    ? "Still checking your fit. A long ad can take up to 2 minutes. Keep this page open."
                    : "Reading the ad and checking your fit. This can take up to a minute. Keep this page open.")}
              </WaitNote>
            </div>
          )}
        </form>
      </Card>
    </section>
  );
}

/**
 * Shown instead of the form when there is no profile to compare the ad with. It names the profile as step 1, the step
 * before this one in the bar at the top of the page (#334, #347), so the user sees why they are sent back.
 */
export function ProfileFirst() {
  return (
    <Card>
      <h2 className="text-xl">Your profile comes first</h2>
      <p className="mt-2 max-w-[65ch] text-text-muted">
        Your profile is step 1. We compare each job ad with the profile you approved, so the match only uses what you
        told us. Upload your CV or fill in your details to build it.
      </p>
      <ButtonLink href="/profile" variant="primary" className="mt-4">
        Build your profile
      </ButtonLink>
    </Card>
  );
}
