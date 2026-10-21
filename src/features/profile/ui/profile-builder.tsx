"use client";

import { useRef, useState } from "react";
import type { JobPreferences, Profile } from "@/shared/contracts";
import { deleteMyProfileAction, suggestFollowUpQuestionsAction } from "../actions";
import type { ConsentRecord, ProfileStorageKind } from "../consent";
import { recordFollowUpAnswer, type FollowUpQuestion } from "../follow-up";
import { getBrowserProfileStore, useStorageIsPersistent, useStoredProfile } from "../profile-store";
import { draftFromExtraction, draftFromProfile, newProfileBase, type ProfileBase, type ReviewDraft } from "../review-draft";
import { fromAccount, fromBrowser, type SavedProfile } from "../saved-profile";
import type { SaveReason } from "../server/save-request";
import type { AccountProfile } from "../server/profile-account";
import { Card, Notice } from "@/shared/ui";
import { ProfileOverview } from "./profile-overview";
import { QuestionsStep, type QuestionsState } from "./questions-step";
import { ReviewStep } from "./review-step";
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
      draft: ReviewDraft;
      base: ProfileBase;
      /** The consent given with a new CV, or the saved one when editing. */
      consent: ConsentRecord | null;
      /** The CV file just read, saved with the profile once the user approves it. */
      file: File | null;
      demo: ExtractSuccess["demo"];
      truncated: boolean;
      /** True for a CV just read; false when editing the saved profile. */
      isNew: boolean;
    }
  | { name: "questions"; afterUpload: boolean };

/**
 * The profile page: upload a CV (with consent), check and approve what was read, answer follow-up questions,
 * then see and manage the saved profile. Nothing is saved before the user approves it (You approve everything).
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
  const [view, setView] = useState<View>({ name: "home" });
  // Focus moves to each new step's heading, but not on the first page load.
  const [navigated, setNavigated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [questionsState, setQuestionsState] = useState<QuestionsState>({ status: "ready", demo: false });

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

  /** Keeps the profile where this page keeps it. Resolves to a message for the user, or null once it is saved. */
  const write = async (
    next: Pick<SavedProfile, "profile" | "questions" | "consent">,
    options: { reason: SaveReason; cv?: File | null },
  ): Promise<string | null> => {
    if (where === "browser") {
      if (!next.consent) return "Upload your CV again to save your profile.";
      getBrowserProfileStore().save({ version: 1, ...next, consent: next.consent, savedAt: new Date().toISOString() });
      return null;
    }

    const result = await saveProfileToAccount(next.profile, {
      reason: options.reason,
      cv: options.cv ?? undefined,
      consentVersion: options.cv ? next.consent?.version : undefined,
    });
    if (!result.ok) return result.message;
    updateAccount({ ...next, savedAt: result.savedAt, cvFormat: result.cvFormat });
    // An older copy from before accounts were switched on is no longer needed in this browser.
    if (getBrowserProfileStore().read()) getBrowserProfileStore().clear();
    return null;
  };

  const setQuestions = (questions: FollowUpQuestion[]) => {
    if (where === "account") {
      const current = accountRef.current;
      if (current) updateAccount({ ...current, questions });
      return;
    }
    const store = getBrowserProfileStore();
    const current = store.read();
    if (current) store.save({ ...current, questions, savedAt: new Date().toISOString() });
  };

  const loadQuestions = async (profile: Profile) => {
    setQuestionsState({ status: "loading" });
    let result: Awaited<ReturnType<typeof suggestFollowUpQuestionsAction>>;
    try {
      result = await suggestFollowUpQuestionsAction(profile);
    } catch {
      result = { ok: false, message: "We couldn’t reach CVision. Check your connection and try again." };
    }
    if (!result.ok) {
      setQuestionsState({ status: "error", message: result.message });
      return;
    }
    setQuestions(result.questions);
    setQuestionsState({ status: "ready", demo: result.demo });
  };

  const handleExtracted = (result: ExtractSuccess, consent: ConsentRecord, file: File) => {
    // A new CV keeps the earlier follow-up answers: they are still the user's own words.
    const base = newProfileBase(result.extraction, {
      id: crypto.randomUUID(),
      followUpAnswers: saved?.profile.followUpAnswers ?? [],
    });
    const draft = draftFromExtraction(result.extraction);
    go({ name: "review", draft, base, consent, file, demo: result.demo, truncated: result.truncated, isNew: true });
  };

  const handleSave = async (profile: Profile): Promise<string | null> => {
    if (view.name !== "review") return null;
    const problem = await write(
      { profile, consent: view.consent, questions: view.isNew ? [] : (latest()?.questions ?? []) },
      { reason: "approved", cv: view.isNew ? view.file : null },
    );
    if (problem) return problem;
    if (view.isNew) {
      go({ name: "questions", afterUpload: true });
      void loadQuestions(profile);
    } else {
      go({ name: "home" }, "Your changes are saved.");
    }
    return null;
  };

  const handleAnswer = async (question: FollowUpQuestion, answer: string): Promise<string | null> => {
    const current = latest();
    if (!current) return "Your profile isn’t saved yet. Reload the page and try again.";
    const profile = recordFollowUpAnswer(current.profile, question, answer, {
      id: crypto.randomUUID(),
      answeredAt: new Date(),
    });
    return write({ ...current, profile }, { reason: "answers" });
  };

  const handlePreferences = async (preferences: JobPreferences): Promise<string | null> => {
    const current = latest();
    if (!current) return "Your profile isn’t saved yet. Reload the page and try again.";
    return write({ ...current, profile: { ...current.profile, preferences } }, { reason: "preferences" });
  };

  const openQuestions = (current: SavedProfile) => {
    go({ name: "questions", afterUpload: false });
    if (current.questions.length === 0) void loadQuestions(current.profile);
    else setQuestionsState({ status: "ready", demo: false });
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
      updateAccount(null);
      go({ name: "home" }, "Your profile, your answers and your CV file are deleted from your account.");
      return null;
    }
    getBrowserProfileStore().clear();
    go({ name: "home" }, "Your profile and your answers are deleted from this browser.");
    return null;
  };

  if (saved === undefined) {
    return (
      <Card aria-busy="true">
        <p className="text-text-muted">Loading your profile…</p>
      </Card>
    );
  }

  let content: React.ReactNode;
  if (view.name === "review") {
    content = (
      <ReviewStep
        draft={view.draft}
        base={view.base}
        isNew={view.isNew}
        demo={view.demo}
        truncated={view.truncated}
        focusHeading={navigated}
        onSave={handleSave}
        onCancel={() => go(view.isNew ? { name: "upload" } : { name: "home" })}
      />
    );
  } else if (view.name === "questions" && saved) {
    content = (
      <QuestionsStep
        questions={saved.questions}
        answers={saved.profile.followUpAnswers}
        state={questionsState}
        showSteps={view.afterUpload}
        focusHeading={navigated}
        onAnswer={handleAnswer}
        onRetry={() => void loadQuestions(saved.profile)}
        onFinish={() => go({ name: "home" }, view.afterUpload ? "Your profile is saved." : null)}
      />
    );
  } else if (view.name === "upload" || !saved) {
    content = (
      <UploadStep
        replacing={saved !== null}
        demoMode={demoMode}
        storage={where}
        focusHeading={navigated}
        onExtracted={handleExtracted}
        onCancel={saved ? () => go({ name: "home" }) : undefined}
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
            draft: draftFromProfile(saved.profile, { approved: true }),
            base: saved.profile,
            consent: saved.consent,
            file: null,
            demo: null,
            truncated: false,
            isNew: false,
          })
        }
        onQuestions={() => openQuestions(saved)}
        onUploadNew={() => go({ name: "upload" })}
        onDelete={handleDelete}
        onSavePreferences={handlePreferences}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message && <Notice tone="success">{message}</Notice>}
      {content}
    </div>
  );
}
