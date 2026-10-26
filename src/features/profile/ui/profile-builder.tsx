"use client";

import { useRef, useState } from "react";
import type { JobPreferences, Profile } from "@/shared/contracts";
import { deleteMyProfileAction } from "../actions";
import type { ConsentRecord, ProfileStorageKind } from "../consent";
import { getBrowserProfileStore, useStorageIsPersistent, useStoredProfile } from "../profile-store";
import {
  draftFromExtraction,
  draftFromProfile,
  emptyDraft,
  newProfileBase,
  type ProfileBase,
  type ReviewDraft,
} from "../review-draft";
import { fromAccount, fromBrowser, type SavedProfile } from "../saved-profile";
import type { SaveReason } from "../server/save-request";
import type { AccountProfile } from "../server/profile-account";
import { Card, Notice } from "@/shared/ui";
import { BackLink } from "./back-link";
import { ProfileOverview } from "./profile-overview";
import { ReviewStep, type ReviewSource } from "./review-step";
import { saveProfileToAccount } from "./save-profile";
import { UploadStep, type ExtractSuccess } from "./upload-step";

/**
 * Where this page keeps the approved profile: in the signed-in user's account (loaded on the server),
 * or in this browser when accounts are not switched on.
 */
export type ProfileStorage = { kind: "browser" } | { kind: "account"; initial: AccountProfile | null };

type View =
  /** The saved profile, or the upload step when there is none. */
  | { name: "home" }
  | { name: "upload" }
  | {
      name: "review";
      /** A CV just read, a profile the user types in by hand, or the saved profile being edited. */
      source: ReviewSource;
      draft: ReviewDraft;
      base: ProfileBase;
      /**
       * The consent given with a new CV, or the saved one when editing. A profile typed in by hand starts without one:
       * the user agrees on the review page, when they approve it.
       */
      consent: ConsentRecord | null;
      /** The CV file just read, saved with the profile once the user approves it. */
      file: File | null;
      demo: ExtractSuccess["demo"];
      truncated: boolean;
    };

/** Where Back goes from this page when the page before it isn't on this site. */
const PAGE_BACK = "/dashboard";

/**
 * The profile page: upload a CV (with consent), or type the details in by hand when there is no CV, check them and
 * approve them all at once, then see and manage the saved profile. Nothing is saved before the user approves it
 * (You approve everything). Back goes to the step before, or from the first step to the page before.
 * `demoMode` is true while the AI is in mock mode, so the page can say so before an upload.
 */
export function ProfileBuilder({ demoMode, storage = { kind: "browser" } }: { demoMode: boolean; storage?: ProfileStorage }) {
  const browserStored = useStoredProfile();
  const persistent = useStorageIsPersistent();
  const [account, setAccount] = useState<SavedProfile | null>(() =>
    storage.kind === "account" && storage.initial ? fromAccount(storage.initial) : null,
  );
  // The latest account profile, for handlers that run after an await.
  const accountRef = useRef(account);
  // What the user has typed in by hand so far, kept while they look at the upload step again.
  const typed = useRef<ReviewDraft | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  // Focus moves to each new step's heading, but not on the first page load.
  const [navigated, setNavigated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const where: ProfileStorageKind = storage.kind;
  const saved: SavedProfile | null | undefined =
    where === "account" ? account : browserStored === undefined ? undefined : browserStored && fromBrowser(browserStored);

  const go = (next: View, note: string | null = null) => {
    setView(next);
    setNavigated(true);
    setMessage(note);
  };

  const updateAccount = (next: SavedProfile | null) => {
    accountRef.current = next;
    setAccount(next);
  };

  /** The saved profile as it is now, even inside a handler that started before the last change. */
  const latest = (): SavedProfile | null => {
    if (where === "account") return accountRef.current;
    const stored = getBrowserProfileStore().read();
    return stored && fromBrowser(stored);
  };

  /**
   * Keeps the profile where this page keeps it. `manual` is true for a profile just typed in by hand: like a new CV,
   * it goes to the account with the consent given for it. Resolves to a message for the user, or null once it is saved.
   */
  const write = async (
    next: Pick<SavedProfile, "profile" | "consent">,
    options: { reason: SaveReason; cv?: File | null; manual?: boolean },
  ): Promise<string | null> => {
    if (where === "browser") {
      if (!next.consent) return "Upload your CV again to save your profile.";
      getBrowserProfileStore().save({ version: 1, ...next, consent: next.consent, savedAt: new Date().toISOString() });
      return null;
    }

    const result = await saveProfileToAccount(next.profile, {
      reason: options.reason,
      cv: options.cv ?? undefined,
      consentVersion: options.cv || options.manual ? next.consent?.version : undefined,
    });
    if (!result.ok) return result.message;
    updateAccount({ ...next, savedAt: result.savedAt, cvFormat: result.cvFormat });
    // An older copy from before accounts were switched on is no longer needed in this browser.
    if (getBrowserProfileStore().read()) getBrowserProfileStore().clear();
    return null;
  };

  const handleExtracted = (result: ExtractSuccess, consent: ConsentRecord, file: File) => {
    // A new CV keeps the earlier follow-up answers: they are still the user's own words.
    const base = newProfileBase(result.extraction, {
      id: crypto.randomUUID(),
      followUpAnswers: saved?.profile.followUpAnswers ?? [],
    });
    const draft = draftFromExtraction(result.extraction);
    go({ name: "review", source: "cv", draft, base, consent, file, demo: result.demo, truncated: result.truncated });
  };

  /** No CV to upload: the review page starts empty, or from what the user typed before going back. */
  const handleStartManual = () => {
    // Nothing is read from a CV, so the job preferences start empty and follow the location the user types.
    const base = newProfileBase(
      { contact: {} },
      { id: crypto.randomUUID(), followUpAnswers: saved?.profile.followUpAnswers ?? [] },
    );
    const draft = typed.current ?? emptyDraft();
    go({ name: "review", source: "manual", draft, base, consent: null, file: null, demo: null, truncated: false });
  };

  /** `consent` is the one given on the review page, for a profile typed in by hand. */
  const handleSave = async (profile: Profile, consent: ConsentRecord | null): Promise<string | null> => {
    if (view.name !== "review") return null;
    const problem = await write(
      { profile, consent: consent ?? view.consent },
      { reason: "approved", cv: view.source === "cv" ? view.file : null, manual: view.source === "manual" },
    );
    if (problem) return problem;
    typed.current = null;
    go({ name: "home" }, view.source === "saved" ? "Your changes are saved." : "Your profile is saved.");
    return null;
  };

  const handlePreferences = async (preferences: JobPreferences): Promise<string | null> => {
    const current = latest();
    if (!current) return "Your profile isn’t saved yet. Reload the page and try again.";
    return write({ ...current, profile: { ...current.profile, preferences } }, { reason: "preferences" });
  };

  const handleDelete = async (): Promise<string | null> => {
    if (where === "account") {
      let result: Awaited<ReturnType<typeof deleteMyProfileAction>>;
      try {
        result = await deleteMyProfileAction();
      } catch {
        result = { ok: false, message: "We couldn’t reach CVision. Check your connection and try again." };
      }
      if (!result.ok) return result.message;
      const hadFile = Boolean(accountRef.current?.cvFormat);
      updateAccount(null);
      go(
        { name: "home" },
        hadFile ? "Your profile and your CV file are deleted from your account." : "Your profile is deleted from your account.",
      );
      return null;
    }
    getBrowserProfileStore().clear();
    go({ name: "home" }, "Your profile is deleted from this browser.");
    return null;
  };

  if (saved === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href={PAGE_BACK} />
        <Card aria-busy="true">
          <p className="text-text-muted">Loading your profile…</p>
        </Card>
      </div>
    );
  }

  // The step before this one, if the page has one; otherwise Back leaves the page.
  let stepBack: (() => void) | undefined;
  let content: React.ReactNode;
  if (view.name === "review") {
    // Going back from a profile typed in by hand keeps what was typed (onDraftChange), for when the user returns.
    stepBack = () => go(view.source === "saved" ? { name: "home" } : { name: "upload" });
    content = (
      <ReviewStep
        draft={view.draft}
        base={view.base}
        source={view.source}
        storage={where}
        demo={view.demo}
        truncated={view.truncated}
        focusHeading={navigated}
        onSave={handleSave}
        onCancel={stepBack}
        onDraftChange={
          view.source === "manual"
            ? (draft) => {
                typed.current = draft;
              }
            : undefined
        }
      />
    );
  } else if (view.name === "upload" || !saved) {
    stepBack = saved ? () => go({ name: "home" }) : undefined;
    content = (
      <UploadStep
        replacing={saved !== null}
        demoMode={demoMode}
        storage={where}
        focusHeading={navigated}
        onExtracted={handleExtracted}
        // Only before there is a profile: a saved one is changed with "Check and edit your details".
        onStartManual={saved ? undefined : handleStartManual}
        onCancel={stepBack}
      />
    );
  } else {
    content = (
      <ProfileOverview
        saved={saved}
        storage={where}
        persistent={persistent}
        focusHeading={navigated}
        onEdit={() =>
          go({
            name: "review",
            source: "saved",
            draft: draftFromProfile(saved.profile),
            base: saved.profile,
            consent: saved.consent,
            file: null,
            demo: null,
            truncated: false,
          })
        }
        onUploadNew={() => go({ name: "upload" })}
        onDelete={handleDelete}
        onSavePreferences={handlePreferences}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {stepBack ? <BackLink onClick={stepBack} /> : <BackLink href={PAGE_BACK} />}
      {message && <Notice tone="success">{message}</Notice>}
      {content}
    </div>
  );
}
