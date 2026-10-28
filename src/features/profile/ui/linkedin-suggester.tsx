"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, ButtonLink, Card, CheckIcon, Notice, Textarea, WarningIcon } from "@/shared/ui";
import type { LinkedInRole, LinkedInSuggestions, NotShown } from "../linkedin";
import { suggestLinkedInAction, type LinkedInResult } from "../linkedin-actions";
import { count } from "./format";
import { SignInNotice } from "./upload-step";

/**
 * Where the lines come from, so the page names it right: a sample person's CV in the demo, the user's own CV, or a
 * profile they typed in by hand, with no CV (card #179).
 */
export type LinesFrom = { kind: "sample"; name: string } | { kind: "cv" } | { kind: "typed" };

/**
 * How the page names where the lines come from: inside a sentence, at its start, and as the place a role or a gap is
 * ("Not on your CV"). A sample person's CV is theirs, not the visitor's.
 */
const sourceNames = {
  sample: { it: "the CV", It: "The CV", on: "on the CV" },
  cv: { it: "your CV", It: "Your CV", on: "on your CV" },
  typed: { it: "your profile", It: "Your profile", on: "in your profile" },
} as const;

/** The sample person's name when the lines are from their CV, otherwise null. */
function sampleNameOf(from: LinesFrom): string | null {
  return from.kind === "sample" ? from.name : null;
}

type LinkedInSuggesterProps = {
  jobId: string;
  /** This page, to come back to after signing in. */
  here: string;
  /** True in mock mode: simple rules choose the lines, not the AI. */
  demoMode: boolean;
  from: LinesFrom;
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
 * LinkedIn Experience lines for one job. Nothing is chosen until the user asks, because with the AI on each request
 * counts against their daily limit; and nothing is saved, so the lines last until the page is left.
 */
export function LinkedInSuggester({ jobId, here, demoMode, from }: LinkedInSuggesterProps) {
  const [state, setState] = useState<State>(start);
  const request = useRef(0);

  // Next.js keeps a page it has left (Activity), so coming back would show lines from a CV the user may have changed
  // since. Start again whenever the page is hidden, and drop any answer to a request sent before that.
  useLayoutEffect(() => {
    return () => {
      request.current += 1;
      setState(start);
    };
  }, []);

  async function suggest() {
    const sent = ++request.current;
    setState((current) => ({ ...current, pending: true, failure: null }));
    let result: LinkedInResult;
    try {
      result = await suggestLinkedInAction({ jobId });
    } catch {
      result = { ok: false, code: "ai-unavailable", message: "We couldn’t reach CVision. Check your connection and try again." };
    }
    if (request.current !== sent) return;
    const outcome = result;
    setState((current) =>
      outcome.ok
        ? { suggestions: outcome.suggestions, shown: current.shown + 1, pending: false, failure: null }
        : { ...current, pending: false, failure: outcome },
    );
  }

  const { suggestions, shown, pending, failure } = state;
  const { it, on } = sourceNames[from.kind];
  const sampleName = sampleNameOf(from);
  const working = (
    <p aria-live="polite" className="sr-only">
      {pending ? "Choosing your LinkedIn lines. This can take up to a minute." : ""}
    </p>
  );
  const notice = demoMode ? (
    <Notice tone="warning" title="Demo mode: lines chosen by simple rules">
      CVision isn’t connected to the AI yet, so simple rules choose each role’s lines: those that name this ad’s
      requirements. {sampleName && `This uses ${sampleName}’s sample CV, not yours.`}
    </Notice>
  ) : (
    sampleName && <Notice tone="warning" title={`This uses ${sampleName}’s sample CV, not yours`} />
  );
  const signIn = failure?.code === "sign-in" && <SignInNotice title="Sign in to get LinkedIn lines" next={here} />;

  if (suggestions) {
    return (
      <div className="flex flex-col gap-6">
        {notice}
        <LinkedInResults suggestions={suggestions} focusKey={shown} from={from} />
        {signIn}
        {failure && failure.code !== "sign-in" && (
          <Notice tone="error" title="We couldn’t choose new lines">
            {againFailed(failure.message, suggestions)}
          </Notice>
        )}
        <Button onClick={suggest} disabled={pending} className="w-full sm:w-auto sm:self-start">
          {pending ? "Choosing your LinkedIn lines…" : "Suggest again"}
        </Button>
        {working}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {notice}
      <Card>
        <h2 className="text-xl">What you get</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
          <li>For each role {on}, the lines that show what this ad asks for, ready to add under it on LinkedIn.</li>
          <li>The skills to add to each role, from {it}.</li>
          <li>Every line in {from.kind === "typed" ? "your" : "the CV’s"} own words, unchanged. Nothing invented.</li>
        </ul>
        <p className="mt-3 max-w-[65ch] text-text-muted">
          We never post to LinkedIn. You copy what you want and paste it into your LinkedIn profile yourself.
        </p>
        <Button variant="primary" onClick={suggest} disabled={pending} className="mt-5 w-full sm:w-auto">
          {pending ? "Choosing your LinkedIn lines…" : "Suggest my LinkedIn lines"}
        </Button>
        {working}
      </Card>

      {signIn}
      {failure && failure.code !== "sign-in" && (
        <Notice tone="error" title="We couldn’t choose your LinkedIn lines">
          {failure.message}
        </Notice>
      )}
    </div>
  );
}

/** Why Suggest again failed, and that the lines on the page are from the last try, when it showed any. */
export function againFailed(message: string, last: LinkedInSuggestions): string {
  return last.roles.length > 0 ? `${message} The lines above are from your last try.` : message;
}

type LinkedInResultsProps = {
  suggestions: LinkedInSuggestions;
  /** The heading takes focus when this changes, but not when the page is shown again after Back. */
  focusKey: number;
  from: LinesFrom;
};

/** The lines for each role, the roles with nothing to add, and what the ad asks for that the CV or profile doesn't show. */
export function LinkedInResults({ suggestions, focusKey, from }: LinkedInResultsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focused = useRef(0);
  const { roles, otherRoles, notShown, dropped } = suggestions;
  const { it } = sourceNames[from.kind];

  useEffect(() => {
    if (focusKey === focused.current) return;
    focused.current = focusKey;
    headingRef.current?.focus();
  }, [focusKey]);

  // "On LinkedIn", not "of your LinkedIn profile": next to "your profile", that could be read as the same one.
  let summary: string;
  if (roles.length > 0) {
    summary = `Each role is one position in the Experience section on LinkedIn, and every line is word for word from ${it}. If a role isn’t on LinkedIn yet, add it as a new position with these details.`;
  } else if (dropped > 0) {
    summary = `We left out ${count(dropped, "suggestion")} that we couldn’t check against ${it}, so there is nothing to add for this job yet. Try Suggest again.`;
  } else {
    summary = `No line of ${it} speaks to this ad’s requirements, so there is nothing to add for this job.`;
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="linkedin-heading" className="flex flex-col gap-6">
        <div>
          <h2 id="linkedin-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
            Your LinkedIn lines
          </h2>
          <p className="mt-2 max-w-[65ch] text-text-muted">{summary}</p>
          {roles.length > 0 && dropped > 0 && (
            <p className="mt-2 text-sm text-text-muted">
              We left out {count(dropped, "suggestion")} that we couldn’t check against {it}.
            </p>
          )}
        </div>

        {roles.map((role) => (
          <RoleCard key={role.id} role={role} from={from} />
        ))}

        {roles.length > 0 && otherRoles.length > 0 && (
          <p className="max-w-[65ch] text-sm text-text-muted">
            Nothing to add for this job to {otherRoles.join("; ")}. Keep {otherRoles.length === 1 ? "it" : "them"} as{" "}
            {otherRoles.length === 1 ? "it is" : "they are"} on LinkedIn.
          </p>
        )}
      </section>

      {notShown.length > 0 && <NotShownCard items={notShown} from={from} />}
    </div>
  );
}

function RoleCard({ role, from }: { role: LinkedInRole; from: LinesFrom }) {
  const headingId = `linkedin-${role.id}`;
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
          {`${sourceNames[from.kind].It} says “${role.cvTitle}”. On LinkedIn, the title is “${role.title}” and “${role.employmentType}” goes under Employment type.`}
        </p>
      )}
      {role.sameCompanyAs && (
        <p className="mt-2 text-sm text-text-muted">
          Same company as {from.kind === "sample" ? "the" : "your"} {role.sameCompanyAs} role: on LinkedIn, add it as another position
          under {role.company}.
        </p>
      )}

      {role.lines.length > 0 && <Lines role={role} />}

      {role.skills.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-text-muted">Skills for this role</h4>
          <p className="mt-1">{role.skills.join(", ")}</p>
        </div>
      )}
    </Card>
  );
}

/** What the Copy button last tried to copy, and whether the browser let it. */
type Copied = { text: string; ok: boolean };

/** "copied" or "failed" only for the text that was copied: once the lines change (Suggest again), Copy is offered again. */
export function copyState(copied: Copied | null, text: string): "ready" | "copied" | "failed" {
  if (copied?.text !== text) return "ready";
  return copied.ok ? "copied" : "failed";
}

/** The lines to add, as the CV or profile says them, and a Copy button for all of them. */
function Lines({ role }: { role: LinkedInRole }) {
  const text = role.lines.map((line) => `• ${line}`).join("\n");
  const [copied, setCopied] = useState<Copied | null>(null);
  const copy = copyState(copied, text);
  const what = `the lines for ${role.title} at ${role.company}`;

  async function copyLines() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ text, ok: true });
    } catch {
      // No clipboard here (an old browser, or a page that isn't https): show the text to select instead.
      setCopied({ text, ok: false });
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h4 className="text-sm font-semibold text-text-muted">Lines to add to this position</h4>
        <Button variant="quiet" onClick={copyLines}>
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
      <p className="mt-1 max-w-[65ch] text-sm text-text-muted">
        If this position is already on LinkedIn, keep its description and add any of these it doesn’t have, near the top.
      </p>
      <p role="status" className={copy === "failed" ? "mt-2 text-sm text-text-muted" : "sr-only"}>
        {copy === "copied" && `Copied ${what}.`}
        {copy === "failed" && "Your browser didn’t let us copy it. Select the text below and copy it yourself."}
      </p>
      {copy === "failed" && <Textarea readOnly value={text} aria-label={`The lines for ${role.title} at ${role.company}`} className="mt-2" />}

      <ul className="mt-3 flex list-disc flex-col gap-3 pl-5">
        {role.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the ad asks for that the CV or profile doesn't show clearly: never in a line, and what to do about it. In the
 * sample data the profile can't be changed, so the advice is only what the gaps are.
 */
function NotShownCard({ items, from }: { items: NotShown[]; from: LinesFrom }) {
  const missing = items.filter((item) => item.kind === "missing");
  const unclear = items.filter((item) => item.kind === "unclear");
  const { it, It, on } = sourceNames[from.kind];
  const sampleName = sampleNameOf(from);
  return (
    <Card aria-labelledby="linkedin-gaps">
      <h2 id="linkedin-gaps" className="text-xl">
        What {it} doesn’t show yet
      </h2>
      <p className="mt-2 max-w-[65ch] text-text-muted">
        {sampleName
          ? `The ad also asks for these, and ${sampleName}’s sample CV doesn’t show them clearly.`
          : `The ad also asks for these, and ${it} doesn’t show them clearly. Don’t add them to LinkedIn unless you have done them.`}
      </p>
      <Gaps
        title={`Not ${on}`}
        advice={sampleName ? null : `If you have done one, add it to your profile first, so every line stays backed by ${it}.`}
        items={missing}
      />
      <Gaps
        title={`Not clear ${on}`}
        advice={
          sampleName
            ? null
            : `${It} touches on these. Add a clear example to ${from.kind === "typed" ? "it" : "your profile"}, in your own words.`
        }
        items={unclear}
      />
      {!sampleName && (
        <ButtonLink href="/profile" className="mt-5">
          Go to my profile
        </ButtonLink>
      )}
    </Card>
  );
}

function Gaps({ title, advice, items }: { title: string; advice: string | null; items: NotShown[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-text-muted">
        {title} ({items.length})
      </h3>
      {advice && <p className="mt-1 max-w-[65ch] text-sm text-text-muted">{advice}</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.requirement} className="flex gap-3">
            <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-semibold">{item.requirement}</p>
              <p className="text-sm text-text-muted">{item.importance === "essential" ? "Essential" : "Desirable"}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
