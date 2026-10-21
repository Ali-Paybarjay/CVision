"use client";

import { useState } from "react";
import type { Profile } from "@/shared/contracts";
import { suggestFollowUpQuestionsAction } from "../actions";
import type { ConsentRecord } from "../consent";
import { recordFollowUpAnswer, type FollowUpQuestion } from "../follow-up";
import { getBrowserProfileStore, useStorageIsPersistent, useStoredProfile, type StoredProfile } from "../profile-store";
import { Card, Notice } from "./kit";
import { ProfileOverview } from "./profile-overview";
import { QuestionsStep, type QuestionsState } from "./questions-step";
import { ReviewStep } from "./review-step";
import { UploadStep, type ExtractSuccess } from "./upload-step";

type View =
  /** The saved profile, or the upload step when there is none. */
  | { name: "home" }
  | { name: "upload" }
  | {
      name: "review";
      profile: Profile;
      consent: ConsentRecord;
      demo: ExtractSuccess["demo"];
      truncated: boolean;
      /** True for a CV just read; false when editing the saved profile. */
      isNew: boolean;
    }
  | { name: "questions"; afterUpload: boolean };

/**
 * The profile page: upload a CV (with consent), check and approve what was read,
 * answer follow-up questions, then see and manage the saved profile.
 * `demoMode` is true while the AI is in mock mode, so the page can say so before an upload.
 */
export function ProfileBuilder({ demoMode }: { demoMode: boolean }) {
  const stored = useStoredProfile();
  const persistent = useStorageIsPersistent();
  const [view, setView] = useState<View>({ name: "home" });
  // Focus moves to each new step's heading, but not on the first page load.
  const [navigated, setNavigated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [questionsState, setQuestionsState] = useState<QuestionsState>({ status: "ready", demo: false });

  const go = (next: View, note: string | null = null) => {
    setView(next);
    setNavigated(true);
    setMessage(note);
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
    const store = getBrowserProfileStore();
    const current = store.read();
    if (current) store.save({ ...current, questions: result.questions, savedAt: new Date().toISOString() });
    setQuestionsState({ status: "ready", demo: result.demo });
  };

  const handleExtracted = (result: ExtractSuccess, consent: ConsentRecord) => {
    // A new CV keeps the earlier follow-up answers: they are still the user's own words.
    const profile = { ...result.profile, followUpAnswers: stored?.profile.followUpAnswers ?? [] };
    go({ name: "review", profile, consent, demo: result.demo, truncated: result.truncated, isNew: true });
  };

  const handleSave = (profile: Profile) => {
    if (view.name !== "review") return;
    const record: StoredProfile = {
      version: 1,
      profile,
      consent: view.consent,
      questions: view.isNew ? [] : (stored?.questions ?? []),
      savedAt: new Date().toISOString(),
    };
    getBrowserProfileStore().save(record);
    if (view.isNew) {
      go({ name: "questions", afterUpload: true });
      void loadQuestions(profile);
    } else {
      go({ name: "home" }, "Your changes are saved.");
    }
  };

  const handleAnswer = (question: FollowUpQuestion, answer: string) => {
    const store = getBrowserProfileStore();
    const current = store.read();
    if (!current) return;
    const profile = recordFollowUpAnswer(current.profile, question, answer, {
      id: crypto.randomUUID(),
      answeredAt: new Date(),
    });
    store.save({ ...current, profile, savedAt: new Date().toISOString() });
  };

  const openQuestions = (current: StoredProfile) => {
    go({ name: "questions", afterUpload: false });
    if (current.questions.length === 0) void loadQuestions(current.profile);
    else setQuestionsState({ status: "ready", demo: false });
  };

  const handleDelete = () => {
    getBrowserProfileStore().clear();
    go({ name: "home" }, "Your profile and your answers are deleted from this browser.");
  };

  if (stored === undefined) {
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
        profile={view.profile}
        isNew={view.isNew}
        demo={view.demo}
        truncated={view.truncated}
        focusHeading={navigated}
        onSave={handleSave}
        onCancel={() => go(view.isNew ? { name: "upload" } : { name: "home" })}
      />
    );
  } else if (view.name === "questions" && stored) {
    content = (
      <QuestionsStep
        questions={stored.questions}
        answers={stored.profile.followUpAnswers}
        state={questionsState}
        showSteps={view.afterUpload}
        focusHeading={navigated}
        onAnswer={handleAnswer}
        onRetry={() => void loadQuestions(stored.profile)}
        onFinish={() => go({ name: "home" }, view.afterUpload ? "Your profile is saved." : null)}
      />
    );
  } else if (view.name === "upload" || !stored) {
    content = (
      <UploadStep
        replacing={stored !== null}
        demoMode={demoMode}
        focusHeading={navigated}
        onExtracted={handleExtracted}
        onCancel={stored ? () => go({ name: "home" }) : undefined}
      />
    );
  } else {
    content = (
      <ProfileOverview
        stored={stored}
        persistent={persistent}
        focusHeading={navigated}
        onEdit={() =>
          go({
            name: "review",
            profile: stored.profile,
            consent: stored.consent,
            demo: null,
            truncated: false,
            isNew: false,
          })
        }
        onQuestions={() => openQuestions(stored)}
        onUploadNew={() => go({ name: "upload" })}
        onDelete={handleDelete}
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
