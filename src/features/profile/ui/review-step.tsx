"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Profile } from "@/shared/contracts";
import { manualConsent, manualConsentPoints, type ConsentRecord, type ProfileStorageKind } from "../consent";
import { mistypedLines } from "../mistyped";
import {
  approvalFor,
  reviewReducer,
  type CertificationDraft,
  type ContactDraft,
  type EducationDraft,
  type ExperienceDraft,
  type FieldErrors,
  type LanguageDraft,
  type ListSection,
  type ProfileBase,
  type ProjectDraft,
  type ReviewAction,
  type ReviewDraft,
  type VolunteeringDraft,
} from "../review-draft";
import { Button, Card, cn, ErrorIcon, Field, Input, Notice, Textarea } from "@/shared/ui";
import { ConsentBox } from "./consent-box";
import { useFocusHeading } from "./focus-heading";
import { MonthYearField } from "./month-year-field";
import { Steps } from "./steps";

/** Where the details on this page come from: a CV just read, the user typing them in by hand, or the saved profile. */
export type ReviewSource = "cv" | "manual" | "saved";

type ReviewStepProps = {
  /** What to check: read from a new CV (draftFromExtraction), empty (emptyDraft) or the saved profile (draftFromProfile). */
  draft: ReviewDraft;
  /** What the saved profile keeps besides the reviewed items: its id, preferences and follow-up answers. */
  base: ProfileBase;
  source: ReviewSource;
  /** Where the approved profile will be kept, so the consent for a profile typed in by hand says so. */
  storage: ProfileStorageKind;
  /** Set in mock mode: whose sample profile is shown, and the text read from the user's own file. */
  demo: { persona: string; text: string } | null;
  truncated: boolean;
  focusHeading: boolean;
  /**
   * Saves the approved profile; resolves to a message for the user if it couldn't. `consent` is the consent given on
   * this page, for a profile typed in by hand, and null otherwise.
   */
  onSave: (profile: Profile, consent: ConsentRecord | null) => Promise<string | null> | void;
  onCancel: () => void;
  /** Hears every change, so a profile being typed in isn't lost when the user goes back to the upload. */
  onDraftChange?: (draft: ReviewDraft) => void;
};

/** The first words under the heading, before "Then approve it all at the end of the page." */
const intro: Record<ReviewSource, string> = {
  cv: "Compare each section with your CV and correct anything that’s wrong.",
  manual: "Fill in each section that applies to you.",
  saved: "Change anything that’s wrong or out of date.",
};

const cancelLabel: Record<ReviewSource, string> = { cv: "Start again", manual: "Upload a CV instead", saved: "Cancel" };

/** The consent box for a profile typed in by hand, which gets focus when it still needs ticking. */
const CONSENT_ID = "review-consent";

export function ReviewStep({
  draft: initialDraft,
  base,
  source,
  storage,
  demo,
  truncated,
  focusHeading,
  onSave,
  onCancel,
  onDraftChange,
}: ReviewStepProps) {
  const [draft, dispatch] = useReducer(reviewReducer, initialDraft);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Only a profile typed in by hand is agreed to on this page: a CV's consent comes with the upload.
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  // New items' keys include this page's own id, so they never clash with items added before the user went back.
  const pageId = useId();
  const added = useRef(0);
  const fromCv = source === "cv";
  const asksConsent = source === "manual";

  useFocusHeading(headingRef, focusHeading);

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  /** An empty section: on a CV just read, the CV didn't have it; otherwise nothing is added yet. */
  const emptyNote = (items: unknown[], notInCv: string, notYet: string) =>
    items.length > 0 ? null : fromCv ? notInCv : notYet;

  const registerCard = (key: string, element: HTMLElement | null) => {
    if (element) cards.current.set(key, element);
    else cards.current.delete(key);
  };

  const focusIn = (key: string, selector: string) => cards.current.get(key)?.querySelector<HTMLElement>(selector)?.focus();

  /** Applies a change straight away, so focus can move to what it produced. */
  const act = (action: ReviewAction) => {
    setSaveError(null);
    flushSync(() => dispatch(action));
  };

  const removeItem = (key: string, section: ListSection) => {
    act({ type: "remove", key });
    document.getElementById(`review-${section}`)?.focus();
  };

  const addItem = (section: ListSection) => {
    added.current += 1;
    const key = `new-${section}-${pageId}-${added.current}`;
    act({ type: "add", section, key });
    focusIn(key, "input");
  };

  /** One approval for the whole page: every item is checked, and the first problem gets focus. */
  const approve = async () => {
    const checked = reviewReducer(draft, { type: "check" });
    act({ type: "check" });
    const consentMissing = asksConsent && !agreed;
    if (consentMissing) setConsentError("Tick the box to agree, so we can save your profile.");
    const approval = approvalFor(checked, base, consentMissing);
    if (!approval.ok) {
      setSaveError(approval.message);
      if (approval.focus === "consent") document.getElementById(CONSENT_ID)?.focus();
      else if (approval.focus) focusIn(approval.focus.item, '[aria-invalid="true"]');
      return;
    }
    setSaving(true);
    try {
      const consent = asksConsent && agreed ? { version: manualConsent.version, givenAt: new Date().toISOString() } : null;
      const problem = await onSave(approval.profile, consent);
      if (problem) setSaveError(problem);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-8">
      {fromCv && <Steps current={1} />}
      <div>
        <h2 id="review-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
          {source === "manual" ? "Add your details" : "Check your details"}
        </h2>
        <p className="mt-2 text-text-muted">
          {intro[source]} Then approve it all at the end of the page. Nothing is saved until you do.
        </p>
        {/* A pilot on this step asked what to do next (#334): the way to approve and what comes after it. */}
        {source !== "saved" && (
          <p className="mt-2">
            Once your profile is approved, you’ll paste a job ad and tailor your CV to it.{" "}
            <a href="#approve-heading" className="font-semibold text-accent underline-offset-4 hover:underline">
              Go to Approve
            </a>
          </p>
        )}
      </div>

      {demo && (
        <div className="flex flex-col gap-3">
          <Notice tone="warning" title={`Demo mode: this is ${demo.persona}’s sample profile, not your CV`}>
            CVision isn’t connected to the AI yet, so it can’t turn your CV into a profile. Your file itself was read:
            open the text below to check it.
          </Notice>
          <details className="rounded-md border border-line bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-accent">
              See the text we read from your file
            </summary>
            <p className="mt-3 max-h-80 overflow-auto text-sm break-words whitespace-pre-wrap">{demo.text}</p>
          </details>
        </div>
      )}
      {truncated && (
        <Notice tone="warning" title="Your CV is very long">
          We read the first part only. Add anything that’s missing below.
        </Notice>
      )}

      <ReviewSection id="review-contact" title="Name and contact">
        <ItemCard registerCard={registerCard} item={draft.contact} title="Your details">
          <ContactFields
            value={draft.contact.value}
            errors={draft.contact.errors}
            onChange={(change) => act({ type: "edit-contact", change })}
          />
        </ItemCard>
      </ReviewSection>

      <ReviewSection id="review-summary" title="Personal statement">
        <ItemCard registerCard={registerCard} item={draft.summary} title="Your summary">
          <Field
            label="Personal statement"
            hint={
              fromCv
                ? "Your CV’s own summary, word for word. Leave it empty if your CV doesn’t have one."
                : "A few sentences about you and the work you want, in your own words. You can leave it empty."
            }
          >
            {(props) => (
              <LinesBox
                {...props}
                value={draft.summary.value.text}
                onChange={(event) => act({ type: "edit-summary", text: event.target.value })}
                className="min-h-32"
              />
            )}
          </Field>
        </ItemCard>
      </ReviewSection>

      <ReviewSection
        id="review-experience"
        title="Work history"
        empty={emptyNote(
          draft.experience,
          "We didn’t find any jobs in your CV.",
          "No jobs yet. Part-time work and placements count too.",
        )}
        addLabel="Add a job"
        onAdd={() => addItem("experience")}
      >
        {draft.experience.map((item) => (
          <ItemCard
            key={item.key}
            registerCard={registerCard}
            item={item}
            title={jobTitle(item.value)}
            onRemove={() => removeItem(item.key, "experience")}
            removeLabel="Remove this job"
          >
            <ExperienceFields
              value={item.value}
              errors={item.errors}
              fromCv={fromCv}
              readFromCv={
                // A job added with "Add a job" (a "new-" key) never came from the CV, even in a draft passed in.
                fromCv && !item.key.startsWith("new-") ? (initialDraft.experience.find((read) => read.key === item.key)?.value ?? null) : null
              }
              onChange={(change) => act({ type: "edit-experience", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection
        id="review-volunteering"
        title="Volunteering"
        empty={emptyNote(draft.volunteering, "We didn’t find any volunteering in your CV.", "No volunteering yet.")}
        addLabel="Add a volunteering role"
        onAdd={() => addItem("volunteering")}
      >
        {draft.volunteering.map((item) => (
          <ItemCard
            key={item.key}
            registerCard={registerCard}
            item={item}
            title={volunteeringTitle(item.value)}
            onRemove={() => removeItem(item.key, "volunteering")}
            removeLabel="Remove this role"
          >
            <VolunteeringFields
              value={item.value}
              errors={item.errors}
              fromCv={fromCv}
              onChange={(change) => act({ type: "edit-volunteering", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection
        id="review-education"
        title="Education"
        empty={emptyNote(
          draft.education,
          "We didn’t find any qualifications in your CV.",
          "No qualifications yet. GCSEs, A levels, degrees and training courses all count.",
        )}
        addLabel="Add a qualification"
        onAdd={() => addItem("education")}
      >
        {draft.education.map((item) => (
          <ItemCard
            key={item.key}
            registerCard={registerCard}
            item={item}
            title={courseTitle(item.value)}
            onRemove={() => removeItem(item.key, "education")}
            removeLabel="Remove this qualification"
          >
            <EducationFields
              value={item.value}
              errors={item.errors}
              onChange={(change) => act({ type: "edit-education", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection
        id="review-projects"
        title="Projects"
        empty={emptyNote(
          draft.projects,
          "We didn’t find any projects in your CV.",
          "No projects yet. Course, personal and open-source projects all count.",
        )}
        addLabel="Add a project"
        onAdd={() => addItem("projects")}
      >
        {draft.projects.map((item) => (
          <ItemCard
            key={item.key}
            registerCard={registerCard}
            item={item}
            title={item.value.name.trim() || "New project"}
            onRemove={() => removeItem(item.key, "projects")}
            removeLabel="Remove this project"
          >
            <ProjectFields
              value={item.value}
              errors={item.errors}
              fromCv={fromCv}
              onChange={(change) => act({ type: "edit-project", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection
        id="review-certifications"
        title="Certificates"
        empty={emptyNote(draft.certifications, "We didn’t find any certificates in your CV.", "No certificates yet.")}
        addLabel="Add a certificate"
        onAdd={() => addItem("certifications")}
      >
        {draft.certifications.map((item) => (
          <ItemCard
            key={item.key}
            registerCard={registerCard}
            item={item}
            title={item.value.name.trim() || "New certificate"}
            onRemove={() => removeItem(item.key, "certifications")}
            removeLabel="Remove this certificate"
          >
            <CertificationFields
              value={item.value}
              errors={item.errors}
              onChange={(change) => act({ type: "edit-certification", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection
        id="review-languages"
        title="Languages"
        empty={emptyNote(draft.languages, "We didn’t find any languages in your CV.", "No languages yet.")}
        addLabel="Add a language"
        onAdd={() => addItem("languages")}
      >
        {draft.languages.map((item) => (
          <ItemCard
            key={item.key}
            registerCard={registerCard}
            item={item}
            title={item.value.name.trim() || "New language"}
            onRemove={() => removeItem(item.key, "languages")}
            removeLabel="Remove this language"
          >
            <LanguageFields
              value={item.value}
              errors={item.errors}
              onChange={(change) => act({ type: "edit-language", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection id="review-skills" title="Skills">
        <ItemCard registerCard={registerCard} item={draft.skills} title="Your skills">
          <SkillsEditor list={draft.skills.value.list} onChange={(list) => act({ type: "edit-skills", list })} />
        </ItemCard>
      </ReviewSection>

      <Card aria-labelledby="approve-heading">
        <h3 id="approve-heading" className="scroll-mt-24 text-xl">
          {source === "saved" ? "Approve your changes" : "Approve your profile"}
        </h3>
        <p className="mt-2 text-text-muted">
          {source === "saved"
            ? "Approving saves everything above to your profile."
            : "Approving saves everything above as your profile. You can change it at any time."}
        </p>
        {asksConsent && (
          <div className="mt-5">
            <ConsentBox
              legend="Before we save your profile"
              points={manualConsentPoints(storage)}
              label={manualConsent.label}
              error={consentError ?? undefined}
              input={{
                id: CONSENT_ID,
                checked: agreed,
                disabled: saving,
                onChange: (event) => {
                  setAgreed(event.target.checked);
                  setConsentError(null);
                },
              }}
            />
          </div>
        )}
        {saveError && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-error">
            <ErrorIcon className="size-4 shrink-0" />
            {saveError}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void approve()} disabled={saving} aria-busy={saving}>
            {saving ? "Saving…" : "Approve and save"}
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={saving}>
            {cancelLabel[source]}
          </Button>
        </div>
      </Card>
    </section>
  );
}

// --- Layout -----------------------------------------------------------------------------------

type ReviewSectionProps = {
  id: string;
  title: string;
  children: React.ReactNode;
  empty?: string | null;
  addLabel?: string;
  onAdd?: () => void;
};

function ReviewSection({ id, title, children, empty, addLabel, onAdd }: ReviewSectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h3 id={id} tabIndex={-1} className="text-xl">
        {title}
      </h3>
      {empty && <p className="text-text-muted">{empty}</p>}
      {children}
      {onAdd && (
        <div>
          <Button onClick={onAdd}>{addLabel}</Button>
        </div>
      )}
    </section>
  );
}

type ItemCardProps = {
  item: { key: string; errors: FieldErrors };
  title: string;
  children: React.ReactNode;
  registerCard: (key: string, element: HTMLElement | null) => void;
  onRemove?: () => void;
  removeLabel?: string;
};

/** One item to check: its fields, edged in the error colour while one of them has a problem. */
function ItemCard({ item, title, children, registerCard, onRemove, removeLabel }: ItemCardProps) {
  const hasProblem = Object.keys(item.errors).length > 0;
  return (
    <article
      ref={(element) => registerCard(item.key, element)}
      className={cn("rounded-lg border bg-surface p-5 sm:p-6", hasProblem ? "border-error" : "border-line")}
    >
      <h4 className="text-lg">{title}</h4>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
      {onRemove && (
        // The negative margin lines the text up with the fields above (quiet buttons keep their padding).
        <Button variant="quiet" className="mt-4 -ml-5" onClick={onRemove}>
          {removeLabel ?? "Remove"}
        </Button>
      )}
    </article>
  );
}

// --- Fields -----------------------------------------------------------------------------------

type FieldsProps<T> = { value: T; errors: FieldErrors; onChange: (change: Partial<T>) => void };

/** `fromCv`: the page shows a CV just uploaded, so the hints can point to the CV. */
type FromCvFieldsProps<T> = FieldsProps<T> & { fromCv: boolean };

/** A job's lines: what is in its boxes now, or what the CV had for it. */
type JobLines = Pick<ExperienceDraft, "duties" | "achievements">;

/**
 * A box of lines that become evidence (the summary, what you did, results). Under it, any line that looks mistyped
 * (mistyped.ts), because the match quotes such a line word for word and Tailor builds on it. It never stops approval.
 */
function LinesBox({ value, ...props }: React.ComponentProps<typeof Textarea> & { value: string }) {
  const noteId = useId();
  const lines = mistypedLines(value);
  const describedBy = [props["aria-describedby"], lines.length > 0 && noteId].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <Textarea {...props} value={value} aria-describedby={describedBy} />
      {lines.length > 0 && (
        <div id={noteId}>
          <Notice tone="warning" title={lines.length === 1 ? "This line looks mistyped" : "These lines look mistyped"}>
            <ul className="flex flex-col gap-1">
              {lines.map((line, index) => (
                <li key={index}>
                  <q dir="auto" className="break-words">
                    {line}
                  </q>
                </li>
              ))}
            </ul>
            <p className="mt-1">
              {lines.length === 1
                ? "Check it before you approve. If it’s right as it is, leave it."
                : "Check them before you approve. If a line is right as it is, leave it."}
            </p>
          </Notice>
        </div>
      )}
    </>
  );
}

/**
 * The hint under "What you did" (#236). A job read from the CV with nothing under it says why the box is empty,
 * so the user doesn't think we dropped their lines; once they type, it is the usual hint again.
 * `read` is what the CV had for this job (null for a job added by hand). The hint speaks of what the CV had, not of
 * what the boxes hold now, so clearing a job's lines or typing a result never makes it say something untrue (#310).
 */
export function dutiesHint(value: JobLines, fromCv: boolean, read: JobLines | null): string {
  if (!fromCv) return "One per line.";
  if (read && value.duties.trim() === "" && read.duties.trim() === "") {
    return read.achievements.trim() === ""
      ? "Your CV has no lines for this job. Add what you did if you want us to use it."
      : "Your CV lists only results for this job, so they’re under Results and achievements. Add what you did if you want us to use it.";
  }
  return "One per line, as on your CV.";
}

/** The user's own details, so each field names its purpose and the phone can fill it in (WCAG 1.3.5). */
function ContactFields({ value, errors, onChange }: FieldsProps<ContactDraft>) {
  return (
    <>
      <Field label="Full name" error={errors.fullName}>
        {(props) => (
          <Input {...props} autoComplete="name" value={value.fullName} onChange={(event) => onChange({ fullName: event.target.value })} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              value={value.email}
              onChange={(event) => onChange({ email: event.target.value })}
            />
          )}
        </Field>
        <Field label="Phone" error={errors.phone}>
          {(props) => (
            <Input
              {...props}
              type="tel"
              autoComplete="tel"
              value={value.phone}
              onChange={(event) => onChange({ phone: event.target.value })}
            />
          )}
        </Field>
        <Field label="Town or city" error={errors.location}>
          {(props) => (
            <Input
              {...props}
              autoComplete="address-level2"
              value={value.location}
              onChange={(event) => onChange({ location: event.target.value })}
            />
          )}
        </Field>
        <Field label="LinkedIn (optional)" error={errors.linkedIn}>
          {(props) => (
            <Input
              {...props}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={value.linkedIn}
              onChange={(event) => onChange({ linkedIn: event.target.value })}
            />
          )}
        </Field>
      </div>
    </>
  );
}

/** `readFromCv`: what the CV had for this job; null for a job added with "Add a job". */
function ExperienceFields({ value, errors, fromCv, readFromCv, onChange }: FromCvFieldsProps<ExperienceDraft> & { readFromCv: JobLines | null }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" error={errors.title}>
          {(props) => <Input {...props} value={value.title} onChange={(event) => onChange({ title: event.target.value })} />}
        </Field>
        <Field label="Employer" error={errors.company}>
          {(props) => <Input {...props} value={value.company} onChange={(event) => onChange({ company: event.target.value })} />}
        </Field>
        <Field label="Location (optional)" error={errors.location}>
          {(props) => <Input {...props} value={value.location} onChange={(event) => onChange({ location: event.target.value })} />}
        </Field>
      </div>
      <MonthRange
        start={value.startDate}
        end={value.endDate}
        current={value.current}
        startGuessed={value.startGuessed}
        endGuessed={value.endGuessed}
        currentLabel="I still work here"
        errors={errors}
        onChange={onChange}
      />
      <Field label="What you did" hint={dutiesHint(value, fromCv, readFromCv)} error={errors.duties}>
        {(props) => (
          <LinesBox {...props} value={value.duties} onChange={(event) => onChange({ duties: event.target.value })} className="min-h-28" />
        )}
      </Field>
      <Field label="Results and achievements" hint="One per line. A number makes each one stronger." error={errors.achievements}>
        {(props) => (
          <LinesBox
            {...props}
            value={value.achievements}
            onChange={(event) => onChange({ achievements: event.target.value })}
            className="min-h-28"
          />
        )}
      </Field>
    </>
  );
}

function VolunteeringFields({ value, errors, fromCv, onChange }: FromCvFieldsProps<VolunteeringDraft>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" hint="For example Volunteer tutor" error={errors.role}>
          {(props) => <Input {...props} value={value.role} onChange={(event) => onChange({ role: event.target.value })} />}
        </Field>
        <Field label="Organisation (optional)" hint="For example a charity, a club or a school" error={errors.organisation}>
          {(props) => (
            <Input {...props} value={value.organisation} onChange={(event) => onChange({ organisation: event.target.value })} />
          )}
        </Field>
        <Field label="Location (optional)" error={errors.location}>
          {(props) => <Input {...props} value={value.location} onChange={(event) => onChange({ location: event.target.value })} />}
        </Field>
      </div>
      <MonthRange
        start={value.startDate}
        end={value.endDate}
        current={value.current}
        startGuessed={value.startGuessed}
        endGuessed={value.endGuessed}
        currentLabel="I still do this"
        optional
        errors={errors}
        onChange={onChange}
      />
      <Field label="What you did" hint={fromCv ? "One per line, as on your CV." : "One per line."} error={errors.details}>
        {(props) => (
          <LinesBox {...props} value={value.details} onChange={(event) => onChange({ details: event.target.value })} className="min-h-28" />
        )}
      </Field>
    </>
  );
}

function EducationFields({ value, errors, onChange }: FieldsProps<EducationDraft>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Qualification" hint="For example BSc, MSc or A levels" error={errors.qualification}>
          {(props) => (
            <Input {...props} value={value.qualification} onChange={(event) => onChange({ qualification: event.target.value })} />
          )}
        </Field>
        <Field label="Subject (optional)" hint="For example Mathematics" error={errors.subject}>
          {(props) => <Input {...props} value={value.subject} onChange={(event) => onChange({ subject: event.target.value })} />}
        </Field>
        <Field label="Where you studied" hint="University, college or training provider" error={errors.institution}>
          {(props) => (
            <Input {...props} value={value.institution} onChange={(event) => onChange({ institution: event.target.value })} />
          )}
        </Field>
        <Field
          label="Grade (optional)"
          hint="As on your certificate. Degrees: First, 2:1, 2:2 or Third. Master’s: Distinction, Merit or Pass."
          error={errors.grade}
        >
          {(props) => <Input {...props} value={value.grade} onChange={(event) => onChange({ grade: event.target.value })} />}
        </Field>
      </div>
      <MonthRange
        start={value.startDate}
        end={value.endDate}
        current={value.current}
        startGuessed={value.startGuessed}
        endGuessed={value.endGuessed}
        currentLabel="I’m still studying for this"
        optional
        finishYearsAhead={6}
        errors={errors}
        onChange={onChange}
      />
    </>
  );
}

function ProjectFields({ value, errors, fromCv, onChange }: FromCvFieldsProps<ProjectDraft>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" error={errors.name}>
          {(props) => <Input {...props} value={value.name} onChange={(event) => onChange({ name: event.target.value })} />}
        </Field>
        <Field label="Course or organisation (optional)" hint="Who it was for, if anyone" error={errors.organisation}>
          {(props) => (
            <Input {...props} value={value.organisation} onChange={(event) => onChange({ organisation: event.target.value })} />
          )}
        </Field>
      </div>
      <MonthRange
        start={value.startDate}
        end={value.endDate}
        current={value.current}
        startGuessed={value.startGuessed}
        endGuessed={value.endGuessed}
        currentLabel="I’m still working on this"
        optional
        errors={errors}
        onChange={onChange}
      />
      <Field label="What you did" hint={fromCv ? "One per line, as on your CV." : "One per line."} error={errors.details}>
        {(props) => (
          <LinesBox {...props} value={value.details} onChange={(event) => onChange({ details: event.target.value })} className="min-h-28" />
        )}
      </Field>
      <Field label="Link (optional)" hint="For example its page on GitHub or in your portfolio" error={errors.url}>
        {(props) => (
          <Input
            {...props}
            type="url"
            inputMode="url"
            value={value.url}
            onChange={(event) => onChange({ url: event.target.value })}
          />
        )}
      </Field>
    </>
  );
}

function CertificationFields({ value, errors, onChange }: FieldsProps<CertificationDraft>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Certificate" error={errors.name}>
        {(props) => <Input {...props} value={value.name} onChange={(event) => onChange({ name: event.target.value })} />}
      </Field>
      <Field label="Issued by (optional)" error={errors.issuer}>
        {(props) => <Input {...props} value={value.issuer} onChange={(event) => onChange({ issuer: event.target.value })} />}
      </Field>
      <Field label="Year (optional)" error={errors.year}>
        {(props) => (
          <Input
            {...props}
            inputMode="numeric"
            maxLength={4}
            value={value.year}
            onChange={(event) => onChange({ year: event.target.value })}
            className="sm:max-w-32"
          />
        )}
      </Field>
    </div>
  );
}

function LanguageFields({ value, errors, onChange }: FieldsProps<LanguageDraft>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Language" error={errors.name}>
        {(props) => <Input {...props} value={value.name} onChange={(event) => onChange({ name: event.target.value })} />}
      </Field>
      <Field label="Level (optional)" hint="For example Native, Fluent or B2" error={errors.level}>
        {(props) => <Input {...props} value={value.level} onChange={(event) => onChange({ level: event.target.value })} />}
      </Field>
    </div>
  );
}

type MonthRangeProps = {
  start: string;
  end: string;
  current: boolean;
  /** True when the month is our guess, because the CV gave only the year. */
  startGuessed: boolean;
  endGuessed: boolean;
  currentLabel: string;
  optional?: boolean;
  /** How many years after this one "Finished" offers, for a course with a known end date that hasn't come yet. */
  finishYearsAhead?: number;
  errors: FieldErrors;
  onChange: (change: { startDate?: string; endDate?: string; current?: boolean }) => void;
};

function MonthRange({
  start,
  end,
  current,
  startGuessed,
  endGuessed,
  currentLabel,
  optional,
  finishYearsAhead = 0,
  errors,
  onChange,
}: MonthRangeProps) {
  const suffix = optional ? " (optional)" : "";
  const hint = (guessed: boolean, month: string) =>
    guessed ? `Your CV gives only the year, so we put ${month}. Check the month.` : undefined;
  const thisYear = new Date().getFullYear();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <MonthYearField
          legend={`Started${suffix}`}
          hint={hint(startGuessed, "January")}
          error={errors.startDate}
          value={start}
          latestYear={thisYear}
          onChange={(startDate) => onChange({ startDate })}
        />
        {!current && (
          <MonthYearField
            legend={`Finished${suffix}`}
            hint={hint(endGuessed, "December")}
            error={errors.endDate}
            value={end}
            latestYear={thisYear + finishYearsAhead}
            onChange={(endDate) => onChange({ endDate })}
          />
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={current}
          // Passing endDate again clears its error without losing what was typed.
          onChange={(event) => onChange({ current: event.target.checked, endDate: end })}
          className="size-5 shrink-0 accent-accent"
        />
        {currentLabel}
      </label>
    </div>
  );
}

function SkillsEditor({ list, onChange }: { list: string[]; onChange: (list: string[]) => void }) {
  const [skill, setSkill] = useState("");

  const add = () => {
    const name = skill.trim();
    if (name && !list.some((existing) => existing.toLowerCase() === name.toLowerCase())) onChange([...list, name]);
    setSkill("");
  };

  return (
    <>
      {list.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {list.map((name) => (
            <li key={name} className="flex items-center gap-1 rounded-full border border-line bg-canvas py-1 pr-1 pl-3 text-sm">
              {name}
              <button
                type="button"
                onClick={() => onChange(list.filter((existing) => existing !== name))}
                className="flex size-8 items-center justify-center rounded-full text-text-muted hover:text-error"
                aria-label={`Remove ${name}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">No skills yet.</p>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Add a skill" hint="Only skills you can give an example of.">
            {(props) => (
              <Input
                {...props}
                value={skill}
                onChange={(event) => setSkill(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add();
                  }
                }}
              />
            )}
          </Field>
        </div>
        <Button onClick={add}>Add</Button>
      </div>
    </>
  );
}

// --- Titles -----------------------------------------------------------------------------------

function jobTitle(value: ExperienceDraft): string {
  const title = value.title.trim() || "New job";
  return value.company.trim() ? `${title} at ${value.company.trim()}` : title;
}

function courseTitle(value: EducationDraft): string {
  return `${value.qualification.trim()} ${value.subject.trim()}`.trim() || "New qualification";
}

function volunteeringTitle(value: VolunteeringDraft): string {
  const role = value.role.trim() || "New volunteering role";
  return value.organisation.trim() ? `${role} at ${value.organisation.trim()}` : role;
}
