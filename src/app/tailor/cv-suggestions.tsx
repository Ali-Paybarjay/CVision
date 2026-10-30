"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { suggestCvChanges } from "@/features/tailor/actions";
import type { TailoringChange } from "@/shared/contracts";
import { Button, Notice } from "@/shared/ui";
import { ChangeCard } from "./change-card";
import { unreachableMessage } from "./messages";

type CvSuggestionsProps = {
  jobId: string;
  /** The suggestions made from the CV that are on the page now (saved or new). */
  changes: TailoringChange[];
  /** True when they were saved on an earlier visit, so there is nothing to ask for. */
  loaded: boolean;
  onSuggested: (changes: TailoringChange[]) => void;
  onDecide: (change: TailoringChange) => Promise<void>;
};

/** Suggestions from the CV alone, asked for as soon as the page opens: the user only approves or rejects. */
export function CvSuggestions({ jobId, changes, loaded, onSuggested, onDecide }: CvSuggestionsProps) {
  const [state, setState] = useState<"waiting" | "done" | { error: string }>(loaded ? "done" : "waiting");
  const [, startTransition] = useTransition();
  // Asked once per page, even when React runs the effect twice in development.
  const asked = useRef(loaded);

  const ask = () => {
    asked.current = true;
    setState("waiting");
    startTransition(async () => {
      try {
        const result = await suggestCvChanges(jobId);
        if (!result.ok) return setState({ error: result.message });
        onSuggested(result.changes);
        setState("done");
      } catch {
        setState({ error: unreachableMessage });
      }
    });
  };

  useEffect(() => {
    if (!asked.current) ask();
    // Runs once when the page opens; `ask` is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="cv-suggestions-heading">
      <div>
        <h2 id="cv-suggestions-heading" className="text-xl">
          Suggestions from your CV
        </h2>
        <p className="mt-1 text-sm text-text-muted">Lines from your own CV, written for this job. Approve the ones you like.</p>
      </div>
      {state === "waiting" && (
        <p className="text-sm text-text-muted" aria-live="polite">
          Reading your CV and the job ad…
        </p>
      )}
      {typeof state === "object" && (
        <Notice tone="error" title="No suggestions yet">
          {state.error}{" "}
          <Button variant="quiet" onClick={ask}>
            Try again
          </Button>
        </Notice>
      )}
      {state === "done" && changes.length === 0 && (
        <Notice tone="success" title="Your CV lines already fit this job">
          There is nothing to rewrite. Check the questions below to add what the job asks for.
        </Notice>
      )}
      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} onDecide={onDecide} />
      ))}
      {state === "done" && (
        <div>
          <Button variant="quiet" onClick={ask}>
            Suggest again
          </Button>
        </div>
      )}
    </section>
  );
}
