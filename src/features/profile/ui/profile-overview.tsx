"use client";

import { useEffect, useRef, useState } from "react";
import type { JobPreferences } from "@/shared/contracts";
import type { ProfileStorageKind } from "../consent";
import { describePreferences, noteLines } from "../preferences";
import type { SavedProfile } from "../saved-profile";
import { count, formatDay, formatPeriod } from "./format";
import { PreferencesForm } from "./preferences-form";
import { Button, ButtonLink, Card, Notice } from "@/shared/ui";

type ProfileOverviewProps = {
  saved: SavedProfile;
  /** Where the profile is kept: the user's account, or this browser. */
  storage: ProfileStorageKind;
  /** False when the browser blocks storage, so a browser profile is lost when the tab closes. */
  persistent: boolean;
  focusHeading: boolean;
  onEdit: () => void;
  onUploadNew: () => void;
  /** Each resolves to a message for the user if it couldn't be done. */
  onDelete: () => Promise<string | null>;
  onSavePreferences: (preferences: JobPreferences) => Promise<string | null>;
};

export function ProfileOverview({
  saved,
  storage,
  persistent,
  focusHeading,
  onEdit,
  onUploadNew,
  onDelete,
  onSavePreferences,
}: ProfileOverviewProps) {
  const { profile } = saved;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null);
  const [editingPreferences, setEditingPreferences] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const latestJob = profile.experience[0];
  const preferences = describePreferences(profile.preferences);
  const notes = noteLines(profile.preferences.notes);
  const anyPreferences = preferences.length > 0 || notes.length > 0;

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  const savePreferences = async (next: JobPreferences) => {
    const problem = await onSavePreferences(next);
    if (!problem) {
      setEditingPreferences(false);
      setPreferencesSaved(true);
    }
    return problem;
  };

  const deleteProfile = async () => {
    setDeleting(true);
    try {
      setDeleteProblem(await onDelete());
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-6">
      {storage === "browser" && !persistent && (
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
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Work history" value={count(profile.experience.length, "job")} />
          <Fact label="Education" value={count(profile.education.length, "qualification")} />
          <Fact label="Certificates" value={count(profile.certifications.length, "certificate")} />
          <Fact label="Skills" value={count(profile.skills.length, "skill")} />
        </dl>
        <Button className="mt-6" onClick={onEdit}>
          Check and edit your details
        </Button>
      </Card>

      <Card>
        <h2 className="text-xl">What you’re looking for</h2>
        {editingPreferences ? (
          <PreferencesForm preferences={profile.preferences} onSave={savePreferences} onCancel={() => setEditingPreferences(false)} />
        ) : (
          <>
            {anyPreferences ? (
              <div className="mt-2 flex flex-col gap-4">
                {preferences.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {preferences.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {notes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold">Must-haves and deal-breakers</h3>
                    <ul className="mt-1 flex flex-col gap-1">
                      {notes.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-text-muted">
                Not set yet. Add the place, contract, hours and pay you want, and any must-haves or deal-breakers.
              </p>
            )}
            {preferencesSaved && (
              <p role="status" className="mt-2 text-sm text-accent">
                Your preferences are saved.
              </p>
            )}
            <Button
              className="mt-4"
              onClick={() => {
                setEditingPreferences(true);
                setPreferencesSaved(false);
              }}
            >
              {anyPreferences ? "Change what you’re looking for" : "Add what you’re looking for"}
            </Button>
          </>
        )}
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
        <p className="mt-2 text-text-muted">{whereItIs(saved, storage, persistent)}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => downloadJson(saved)}>Download my data</Button>
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
              {storage === "account"
                ? "Delete your profile and your CV file from your account?"
                : "Delete your profile from this browser?"}
            </p>
            <p className="mt-1 text-sm text-text-muted">This can’t be undone. Download your data first to keep a copy.</p>
            {deleteProblem && <p className="mt-2 text-sm text-error">{deleteProblem}</p>}
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void deleteProfile()}
                disabled={deleting}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-error px-5 text-sm font-semibold text-error hover:bg-canvas disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete everything"}
              </button>
              {/* The safe choice gets focus first. */}
              <Button variant="quiet" onClick={() => setConfirmingDelete(false)} autoFocus disabled={deleting}>
                Keep my profile
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

/** One plain sentence on where the profile is kept and since when. */
function whereItIs(saved: SavedProfile, storage: ProfileStorageKind, persistent: boolean): string {
  const changed = `last changed on ${formatDay(saved.savedAt)}`;
  if (storage === "account") {
    const file = saved.cvFormat ? ` The CV file you uploaded (${saved.cvFormat === "pdf" ? "PDF" : "Word"}) is kept with it.` : "";
    return `Saved to your CVision account, ${changed}.${file}`;
  }
  const agreed = saved.consent ? ` You agreed to us reading your CV on ${formatDay(saved.consent.givenAt)}.` : "";
  return `${persistent ? "Saved in this browser only" : "Kept in this tab only"}, ${changed}.${agreed}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** Saves everything the page holds about the user's profile as a JSON file (Your data is yours). */
function downloadJson(saved: SavedProfile) {
  const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cvision-profile-${saved.savedAt.slice(0, 10)}.json`;
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
