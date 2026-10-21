"use client";

import { useEffect, useRef, useState } from "react";
import type { StoredProfile } from "../profile-store";
import { count, formatDay, formatPeriod } from "./format";
import { Button, ButtonLink, Card, Notice } from "@/shared/ui";

type ProfileOverviewProps = {
  stored: StoredProfile;
  /** False when the browser blocks storage, so the profile is lost when the tab closes. */
  persistent: boolean;
  focusHeading: boolean;
  onEdit: () => void;
  onQuestions: () => void;
  onUploadNew: () => void;
  onDelete: () => void;
};

export function ProfileOverview({
  stored,
  persistent,
  focusHeading,
  onEdit,
  onQuestions,
  onUploadNew,
  onDelete,
}: ProfileOverviewProps) {
  const { profile } = stored;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const latestJob = profile.experience[0];
  const unanswered = stored.questions.filter(
    (question) => !profile.followUpAnswers.some((answer) => answer.question === question.question),
  ).length;

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-6">
      {!persistent && (
        <Notice tone="warning" title="This browser doesn’t keep saved data">
          Your profile will be lost when you close this tab. Download your data to keep a copy.
        </Notice>
      )}

      <Card>
        <h2 id="overview-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
          {profile.fullName}
        </h2>
        {latestJob && (
          <p className="mt-1 text-text-muted">
            {latestJob.title} at {latestJob.company} · {formatPeriod(latestJob.startDate, latestJob.endDate)}
          </p>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact label="Work history" value={count(profile.experience.length, "job")} />
          <Fact label="Education" value={count(profile.education.length, "qualification")} />
          <Fact label="Certificates" value={count(profile.certifications.length, "certificate")} />
          <Fact label="Skills" value={count(profile.skills.length, "skill")} />
          <Fact label="Your answers" value={count(profile.followUpAnswers.length, "answer")} />
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onEdit}>Check and edit your details</Button>
          <Button onClick={onQuestions}>
            {unanswered > 0 ? `Answer follow-up questions (${unanswered})` : "Follow-up questions"}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl">Next: find a job to apply for</h2>
        <p className="mt-2 text-text-muted">
          Paste a job ad and see where your experience already matches. Your tailored CV only uses what you approved
          here.
        </p>
        <ButtonLink href="/jobs" variant="primary" className="mt-4">
          Paste a job ad
        </ButtonLink>
      </Card>

      <Card>
        <h2 className="text-xl">Your data</h2>
        <p className="mt-2 text-text-muted">
          {persistent ? "Saved in this browser only" : "Kept in this tab only"}, last changed on{" "}
          {formatDay(stored.savedAt)}. You agreed to us reading your CV on {formatDay(stored.consent.givenAt)}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => downloadJson(stored)}>Download my data</Button>
          <Button variant="quiet" onClick={onUploadNew}>
            Upload a new CV
          </Button>
          {!confirmingDelete && (
            <Button variant="quiet" onClick={() => setConfirmingDelete(true)}>
              Delete my profile
            </Button>
          )}
        </div>
        {confirmingDelete && (
          <div role="alertdialog" aria-labelledby="delete-question" className="mt-4 rounded-md border border-error p-4">
            <p id="delete-question" className="font-semibold">
              Delete your profile and your answers from this browser?
            </p>
            <p className="mt-1 text-sm text-text-muted">This can’t be undone. Download your data first to keep a copy.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-error px-5 text-sm font-semibold text-error hover:bg-canvas"
              >
                Delete everything
              </button>
              {/* The safe choice gets focus first. */}
              <Button variant="quiet" onClick={() => setConfirmingDelete(false)} autoFocus>
                Keep my profile
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** Saves everything we hold about the user's profile as a JSON file (Your data is yours). */
function downloadJson(stored: StoredProfile) {
  const blob = new Blob([JSON.stringify(stored, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cvision-profile-${stored.savedAt.slice(0, 10)}.json`;
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
