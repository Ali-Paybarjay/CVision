"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { findBrandProblems } from "@/features/tailor/brand-check";
import { Button, ButtonLink, Card, CheckIcon, FitLine, Notice, Textarea, WarningIcon } from "@/shared/ui";
import type { LinkedInLine, LinkedInRole, LinkedInSuggestions, NotShown } from "../linkedin";
import { suggestLinkedInAction, type LinkedInResult } from "../linkedin-actions";
import { count } from "./format";
import { SignInNotice } from "./upload-step";

type LinkedInSuggesterProps = {
  jobId: string;
  /** This page, to come back to after signing in. */
  here: string;
  /** True in mock mode: the lines come from simple rules, not the AI. */
  demoMode: boolean;
  /** Set when the lines come from a sample person's CV, not the user's own: their name. */
  sampleName: string | null;
};

type State = {
  suggestions: LinkedInSuggestions | null;
  /** Counts the results shown, so the heading takes focus once for each new result. */
  shown: number;
  pending: boolean;
  failure: Extract<LinkedInResult, { ok: false }> | null;
};

const start: State = { suggestions: null, shown: 0, pending: false, failure: null };

/**
 * LinkedIn Experience lines for one job. Nothing is written until the user asks, because with the AI on each request
 * counts against their daily limit; and nothing is saved, so the lines last until the page is left.
 */
export function LinkedInSuggester({ jobId, here, demoMode, sampleName }: LinkedInSuggesterProps) {
  const [state, setState] = useState<State>(start);
  const answered = useRef(false);

  // Next.js keeps a page it has left (Activity), so coming back would show lines written from a CV the user may
  // have changed since. Start again whenever the page is hidden.
  useLayoutEffect(() => {
    return () => {
      if (answered.current) {
        answered.current = false;
        setState(start);
      }
    };
  }, []);

  async function suggest() {
    setState((current) => ({ ...current, pending: true, failure: null }));
    let result: LinkedInResult;
    try {
      result = await suggestLinkedInAction({ jobId });
    } catch {
      result = { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
    }
    answered.current = true;
    const outcome = result;
    setState((current) =>
      outcome.ok
        ? { suggestions: outcome.suggestions, shown: current.shown + 1, pending: false, failure: null }
        : { ...current, pending: false, failure: outcome },
    );
  }

  const { suggestions, shown, pending, failure } = state;
  const working = (
    <p aria-live="polite" className="sr-only">
      {pending ? "Writing your LinkedIn lines. This can take up to a minute." : ""}
    </p>
  );
  const problem =
    failure &&
    (failure.code === "sign-in" ? (
      <SignInNotice title="Sign in to get LinkedIn lines" next={here} />
    ) : (
      <Notice tone="error" title="We couldn’t write your LinkedIn lines">
        {failure.message}
      </Notice>
    ));

  if (suggestions) {
    return (
      <div className="flex flex-col gap-6">
        {problem}
        <LinkedInResults suggestions={suggestions} focusKey={shown} />
        <Button onClick={suggest} disabled={pending} className="w-full sm:w-auto sm:self-start">
          {pending ? "Writing your LinkedIn lines…" : "Suggest again"}
        </Button>
        {working}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {demoMode && (
        <Notice tone="warning" title="Demo mode: lines straight from the CV">
          CVision isn’t connected to the AI yet, so each role shows the lines of the CV that name this ad’s requirements,
          word for word. {sampleName && `This uses ${sampleName}’s sample CV, not yours.`}
        </Notice>
      )}
      {!demoMode && sampleName && <Notice tone="warning" title={`This uses ${sampleName}’s sample CV, not yours`} />}

      <Card>
        <h2 className="text-xl">What you get</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
          <li>For each role on your CV, the lines that show what this ad asks for, ready to paste under it on LinkedIn.</li>
          <li>The skills to add to each role, from your CV.</li>
          <li>Next to every line, the part of your CV it comes from. Nothing invented.</li>
        </ul>
        <p className="mt-3 max-w-[65ch] text-text-muted">
          We never post to LinkedIn. You copy what you want and paste it into your LinkedIn profile yourself.
        </p>
        <Button variant="primary" onClick={suggest} disabled={pending} className="mt-5 w-full sm:w-auto">
          {pending ? "Writing your LinkedIn lines…" : "Suggest my LinkedIn lines"}
        </Button>
        {working}
      </Card>

      {problem}
    </div>
  );
}

/**
 * The lines for each role, the roles with nothing to add, and what the ad asks for that the CV doesn't show.
 * The heading takes focus when `focusKey` changes, but not when the page is shown again after Back.
 */
export function LinkedInResults({ suggestions, focusKey }: { suggestions: LinkedInSuggestions; focusKey: number }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focused = useRef(0);
  const { roles, otherRoles, notShown, dropped } = suggestions;
  const reworded = roles.some((role) => role.lines.some((line) => line.reworded));

  useEffect(() => {
    if (focusKey === focused.current) return;
    focused.current = focusKey;
    headingRef.current?.focus();
  }, [focusKey]);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="linkedin-heading" className="flex flex-col gap-6">
        <div>
          <h2 id="linkedin-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
            Your LinkedIn lines
          </h2>
          {roles.length > 0 ? (
            <p className="mt-2 max-w-[65ch] text-text-muted">
              Each role is one position in the Experience section of your LinkedIn profile. If a role isn’t on LinkedIn
              yet, add it as a new position with these details.
              {reworded && " Highlighted lines are reworded from your CV; the rest are its own words."}
            </p>
          ) : (
            <p className="mt-2 max-w-[65ch] text-text-muted">
              No line of your CV speaks to this ad’s requirements, so there is nothing to add for this job.
            </p>
          )}
          {dropped > 0 && (
            <p className="mt-2 text-sm text-text-muted">
              We left out {count(dropped, "suggestion")} that your CV doesn’t back up.
            </p>
          )}
        </div>

        {roles.map((role) => (
          <RoleCard key={role.id} role={role} />
        ))}

        {roles.length > 0 && otherRoles.length > 0 && (
          <p className="max-w-[65ch] text-sm text-text-muted">
            Nothing to add for this job to {otherRoles.join("; ")}. Keep {otherRoles.length === 1 ? "it" : "them"} as{" "}
            {otherRoles.length === 1 ? "it is" : "they are"} on LinkedIn.
          </p>
        )}
      </section>

      {notShown.length > 0 && <NotShownCard items={notShown} />}
    </div>
  );
}

function RoleCard({ role }: { role: LinkedInRole }) {
  const headingId = `linkedin-${role.id}`;
  const problems = findBrandProblems(role.lines.map((line) => line.text).join("\n"));
  const facts = [
    ["Company", role.company],
    ["Employment type", role.employmentType],
    ["Dates", role.period],
    ["Location", role.location],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <Card as="article" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-xl">
        {role.title}
      </h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-text-muted">{term}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {role.cvTitle !== role.title && (
        <p className="mt-2 text-sm text-text-muted">
          Your CV says “{role.cvTitle}”. On LinkedIn, the title is “{role.title}” and “{role.employmentType}” goes under
          Employment type.
        </p>
      )}
      {role.sameCompanyAs && (
        <p className="mt-2 text-sm text-text-muted">
          Same company as your {role.sameCompanyAs} role: on LinkedIn, add it as another position under {role.company}.
        </p>
      )}

      {role.lines.length > 0 && <Description role={role} />}

      {role.skills.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-text-muted">Skills for this role</h4>
          <p className="mt-1">{role.skills.join(", ")}</p>
        </div>
      )}

      {problems.length > 0 && (
        <Notice tone="warning" title="Check these words" className="mt-5">
          <ul className="list-disc pl-5">
            {problems.map((problem, index) => (
              <li key={index}>
                “{problem.found}”
                {problem.suggestion ? `: write “${problem.suggestion}”` : ": rewrite this, it is not in our voice"}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </Card>
  );
}

/** The description: its lines, each with the words of the CV it comes from, and a Copy button for all of them. */
function Description({ role }: { role: LinkedInRole }) {
  const [copy, setCopy] = useState<"ready" | "copied" | "failed">("ready");
  const text = role.lines.map((line) => `• ${line.text}`).join("\n");
  const what = `the description for ${role.title} at ${role.company}`;

  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      // No clipboard here (an old browser, or a page that isn't https): show the text to select instead.
      setCopy("failed");
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h4 className="text-sm font-semibold text-text-muted">Description</h4>
        <Button variant="quiet" onClick={copyDescription}>
          {copy === "copied" ? (
            <>
              <CheckIcon className="size-4" />
              Copied
            </>
          ) : (
            "Copy"
          )}
          <span className="sr-only"> {what}</span>
        </Button>
      </div>
      <p role="status" className="sr-only">
        {copy === "copied" ? `Copied ${what}.` : ""}
      </p>
      {copy === "failed" && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-text-muted">Your browser didn’t let us copy it. Select the text below and copy it yourself.</p>
          <Textarea readOnly value={text} aria-label={`The description for ${role.title} at ${role.company}`} />
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-4">
        {role.lines.map((line) => (
          <li key={line.text}>
            <LineText line={line} />
            <p className="mt-1 text-sm text-text-muted">
              {fromAnswers(line) ? "From your answer: " : "From your CV: "}
              {line.sources.map((source, index) => (
                <span key={index}>
                  {index > 0 && " · "}
                  <q className="break-words">{source.text}</q>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fromAnswers(line: LinkedInLine): boolean {
  return line.sources.every((source) => source.kind === "answer");
}

function LineText({ line }: { line: LinkedInLine }) {
  if (!line.reworded) return <p>{line.text}</p>;
  return (
    <FitLine>
      {line.text}
      <span className="sr-only"> (reworded from your {fromAnswers(line) ? "answer" : "CV"})</span>
    </FitLine>
  );
}

/** What the ad asks for that the CV doesn't show clearly: never written into a line, and why. */
function NotShownCard({ items }: { items: NotShown[] }) {
  return (
    <Card>
      <h2 className="text-xl">What your CV doesn’t show yet</h2>
      <p className="mt-2 max-w-[65ch] text-text-muted">
        The ad also asks for these, and your CV doesn’t show them clearly. Don’t add them to LinkedIn unless you have done
        them. If you have, add them to your profile first, so every line stays backed by your CV.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.requirement} className="flex gap-3">
            <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-semibold">{item.requirement}</p>
              <p className="text-sm text-text-muted">
                {item.importance === "essential" ? "Essential" : "Desirable"} ·{" "}
                {item.kind === "missing" ? "Not on your CV" : "Not clear on your CV"}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <ButtonLink href="/profile" className="mt-5">
        Go to my profile
      </ButtonLink>
    </Card>
  );
}
