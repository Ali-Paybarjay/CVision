"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Profile } from "@/shared/contracts";
import {
  itemsWithProblems,
  profileFromDraft,
  reviewReducer,
  type CertificationDraft,
  type ContactDraft,
  type EducationDraft,
  type ExperienceDraft,
  type FieldErrors,
  type ListSection,
  type ProfileBase,
  type ReviewAction,
  type ReviewDraft,
} from "../review-draft";
import { count } from "./format";
import { Button, Card, cn, ErrorIcon, Field, Input, Notice, Textarea } from "@/shared/ui";
import { Steps } from "./steps";

type ReviewStepProps = {
  /** What to check: read from a new CV (draftFromExtraction) or from the saved profile (draftFromProfile). */
  draft: ReviewDraft;
  /** What the saved profile keeps besides the reviewed items: its id, preferences and follow-up answers. */
  base: ProfileBase;
  /** True for a CV just read; false when editing a saved profile. */
  isNew: boolean;
  /** Set in mock mode: whose sample profile is shown, and the text read from the user's own file. */
  demo: { persona: string; text: string } | null;
  truncated: boolean;
  focusHeading: boolean;
  /** Saves the approved profile; resolves to a message for the user if it couldn't. */
  onSave: (profile: Profile) => Promise<string | null> | void;
  onCancel: () => void;
};

export function ReviewStep({ draft: initialDraft, base, isNew, demo, truncated, focusHeading, onSave, onCancel }: ReviewStepProps) {
  const [draft, dispatch] = useReducer(reviewReducer, initialDraft);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const added = useRef(0);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

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
    const key = `new-${section}-${added.current}`;
    act({ type: "add", section, key });
    focusIn(key, "input");
  };

  /** One approval for the whole page: every item is checked, and the first problem gets focus. */
  const approve = async () => {
    const checked = reviewReducer(draft, { type: "check" });
    act({ type: "check" });
    const problems = itemsWithProblems(checked);
    if (problems.length > 0) {
      setSaveError(`Fix the ${count(problems.length, "item")} marked above, then approve again.`);
      focusIn(problems[0], '[aria-invalid="true"]');
      return;
    }
    let profile: Profile;
    try {
      profile = profileFromDraft(checked, base);
    } catch {
      setSaveError("Some details are not valid. Check them, then approve again.");
      return;
    }
    setSaving(true);
    try {
      const problem = await onSave(profile);
      if (problem) setSaveError(problem);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-8">
      {isNew && <Steps current={1} />}
      <div>
        <h2 id="review-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
          Check your details
        </h2>
        <p className="mt-2 text-text-muted">
          {isNew ? "Compare each section with your CV and correct anything that’s wrong." : "Change anything that’s wrong or out of date."}{" "}
          Then approve it all at the end of the page. Nothing is saved until you do.
        </p>
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
            hint="Your CV’s own summary, word for word. Leave it empty if your CV doesn’t have one."
          >
            {(props) => (
              <Textarea
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
        empty={draft.experience.length === 0 ? "We didn’t find any jobs in your CV." : null}
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
              onChange={(change) => act({ type: "edit-experience", key: item.key, change })}
            />
          </ItemCard>
        ))}
      </ReviewSection>

      <ReviewSection
        id="review-education"
        title="Education"
        empty={draft.education.length === 0 ? "We didn’t find any qualifications in your CV." : null}
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
        id="review-certifications"
        title="Certificates"
        empty={draft.certifications.length === 0 ? "We didn’t find any certificates in your CV." : null}
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

      <ReviewSection id="review-skills" title="Skills">
        <ItemCard registerCard={registerCard} item={draft.skills} title="Your skills">
          <SkillsEditor list={draft.skills.value.list} onChange={(list) => act({ type: "edit-skills", list })} />
        </ItemCard>
      </ReviewSection>

      <Card aria-labelledby="approve-heading">
        <h3 id="approve-heading" className="text-xl">
          {isNew ? "Approve your profile" : "Approve your changes"}
        </h3>
        <p className="mt-2 text-text-muted">
          {isNew
            ? "Approving saves everything above as your profile. You can change it at any time."
            : "Approving saves everything above to your profile."}
        </p>
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
            {isNew ? "Start again" : "Cancel"}
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

function ContactFields({ value, errors, onChange }: FieldsProps<ContactDraft>) {
  return (
    <>
      <Field label="Full name" error={errors.fullName}>
        {(props) => <Input {...props} value={value.fullName} onChange={(event) => onChange({ fullName: event.target.value })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email}>
          {(props) => (
            <Input {...props} type="email" value={value.email} onChange={(event) => onChange({ email: event.target.value })} />
          )}
        </Field>
        <Field label="Phone" error={errors.phone}>
          {(props) => (
            <Input {...props} type="tel" value={value.phone} onChange={(event) => onChange({ phone: event.target.value })} />
          )}
        </Field>
        <Field label="Town or city" error={errors.location}>
          {(props) => <Input {...props} value={value.location} onChange={(event) => onChange({ location: event.target.value })} />}
        </Field>
        <Field label="LinkedIn (optional)" error={errors.linkedIn}>
          {(props) => (
            <Input
              {...props}
              type="url"
              inputMode="url"
              value={value.linkedIn}
              onChange={(event) => onChange({ linkedIn: event.target.value })}
            />
          )}
        </Field>
      </div>
    </>
  );
}

function ExperienceFields({ value, errors, onChange }: FieldsProps<ExperienceDraft>) {
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
      <Field label="What you did" hint="One per line, as on your CV." error={errors.duties}>
        {(props) => (
          <Textarea {...props} value={value.duties} onChange={(event) => onChange({ duties: event.target.value })} className="min-h-28" />
        )}
      </Field>
      <Field label="Results and achievements" hint="One per line. A number makes each one stronger." error={errors.achievements}>
        {(props) => (
          <Textarea
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
        errors={errors}
        onChange={onChange}
      />
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

type MonthRangeProps = {
  start: string;
  end: string;
  current: boolean;
  /** True when the month is our guess, because the CV gave only the year. */
  startGuessed: boolean;
  endGuessed: boolean;
  currentLabel: string;
  optional?: boolean;
  errors: FieldErrors;
  onChange: (change: { startDate?: string; endDate?: string; current?: boolean }) => void;
};

function MonthRange({ start, end, current, startGuessed, endGuessed, currentLabel, optional, errors, onChange }: MonthRangeProps) {
  const suffix = optional ? " (optional)" : "";
  const hint = (guessed: boolean, month: string) =>
    guessed ? `Your CV gives only the year, so we put ${month}. Check the month.` : "Month and year";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Started${suffix}`} hint={hint(startGuessed, "January")} error={errors.startDate}>
          {(props) => (
            <Input
              {...props}
              type="month"
              placeholder="YYYY-MM"
              value={start}
              onChange={(event) => onChange({ startDate: event.target.value })}
            />
          )}
        </Field>
        {!current && (
          <Field label={`Finished${suffix}`} hint={hint(endGuessed, "December")} error={errors.endDate}>
            {(props) => (
              <Input
                {...props}
                type="month"
                placeholder="YYYY-MM"
                value={end}
                onChange={(event) => onChange({ endDate: event.target.value })}
              />
            )}
          </Field>
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
