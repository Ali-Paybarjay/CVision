"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Profile } from "@/shared/contracts";
import {
  draftFromProfile,
  profileFromDraft,
  reviewProgress,
  reviewReducer,
  type CertificationDraft,
  type ContactDraft,
  type EducationDraft,
  type ExperienceDraft,
  type FieldErrors,
  type ListSection,
  type ReviewAction,
  type ReviewDraft,
} from "../review-draft";
import { tidyPhone } from "../phone";
import { count, formatPeriod } from "./format";
import { Button, CheckIcon, cn, ErrorIcon, Field, Input, Notice, Textarea } from "@/shared/ui";
import { Steps } from "./steps";

type ReviewStepProps = {
  profile: Profile;
  /** True for a CV just read; false when editing a saved profile. */
  isNew: boolean;
  /** Set in mock mode: whose sample profile is shown, and the text read from the user's own file. */
  demo: { persona: string; text: string } | null;
  truncated: boolean;
  focusHeading: boolean;
  onSave: (profile: Profile) => void;
  onCancel: () => void;
};

export function ReviewStep({ profile, isNew, demo, truncated, focusHeading, onSave, onCancel }: ReviewStepProps) {
  const [draft, dispatch] = useReducer(reviewReducer, profile, draftFromProfile);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const added = useRef(0);
  const { approved, total } = reviewProgress(draft);

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

  const approveItem = (key: string) => {
    const next = reviewReducer(draft, { type: "approve", key });
    act({ type: "approve", key });
    const order = entryOrder(next);
    if (!isApproved(next, key)) {
      focusIn(key, '[aria-invalid="true"]');
      return;
    }
    const start = order.indexOf(key);
    const following = [...order.slice(start + 1), ...order.slice(0, start)].find((other) => !isApproved(next, other));
    if (following) focusIn(following, "[data-card-heading]");
    else document.getElementById("save-profile")?.focus();
  };

  const editItem = (key: string) => {
    act({ type: "unapprove", key });
    focusIn(key, "input, textarea");
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

  const save = () => {
    if (approved < total) {
      const left = total - approved;
      setSaveError(`Approve every item first: ${count(left, "item")} still to check.`);
      return;
    }
    try {
      onSave(profileFromDraft(draft, profile));
    } catch {
      setSaveError("Some details are not valid. Check each item, then approve it again.");
    }
  };

  const shared = { registerCard, onApprove: approveItem, onEdit: editItem };

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-8">
      {isNew && <Steps current={1} />}
      <div>
        <h2 id="review-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
          Check your details
        </h2>
        <p className="mt-2 text-text-muted">
          Compare each item with your CV. Correct anything that’s wrong, then approve it. Nothing is saved until every
          item is approved.
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
        <ItemCard
          {...shared}
          itemKey={draft.contact.key}
          title="Your details"
          approved={draft.contact.approved}
          summary={contactSummary(draft.contact.value)}
        >
          <ContactFields
            value={draft.contact.value}
            errors={draft.contact.errors}
            onChange={(change) => act({ type: "edit-contact", change })}
          />
        </ItemCard>
      </ReviewSection>

      <ReviewSection id="review-summary" title="Personal statement">
        <ItemCard
          {...shared}
          itemKey={draft.summary.key}
          title="Your summary"
          approved={draft.summary.approved}
          summary={draft.summary.value.text.trim() ? shorten(draft.summary.value.text, 220) : "No personal statement."}
        >
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
            {...shared}
            key={item.key}
            itemKey={item.key}
            title={jobTitle(item.value)}
            approved={item.approved}
            summary={experienceSummary(item.value)}
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
            {...shared}
            key={item.key}
            itemKey={item.key}
            title={courseTitle(item.value)}
            approved={item.approved}
            summary={educationSummary(item.value)}
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
            {...shared}
            key={item.key}
            itemKey={item.key}
            title={item.value.name.trim() || "New certificate"}
            approved={item.approved}
            summary={[item.value.issuer, item.value.year].filter(Boolean).join(" · ") || "No issuer or year."}
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
        <ItemCard
          {...shared}
          itemKey={draft.skills.key}
          title="Your skills"
          approved={draft.skills.approved}
          summary={draft.skills.value.list.join(", ") || "No skills listed."}
        >
          <SkillsEditor list={draft.skills.value.list} onChange={(list) => act({ type: "edit-skills", list })} />
        </ItemCard>
      </ReviewSection>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-4 sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" aria-live="polite">
            <strong>
              {approved} of {total}
            </strong>{" "}
            items approved
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="quiet" onClick={onCancel}>
              {isNew ? "Start again" : "Cancel"}
            </Button>
            <Button id="save-profile" variant="primary" onClick={save}>
              Save my profile
            </Button>
          </div>
        </div>
        {saveError && (
          <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-error">
            <ErrorIcon className="size-4 shrink-0" />
            {saveError}
          </p>
        )}
      </div>
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
  itemKey: string;
  title: string;
  approved: boolean;
  /** The one-line view of an approved item. */
  summary: string;
  children: React.ReactNode;
  registerCard: (key: string, element: HTMLElement | null) => void;
  onApprove: (key: string) => void;
  onEdit: (key: string) => void;
  onRemove?: () => void;
  removeLabel?: string;
};

/** One item to check: its fields and an Approve button, or a one-line summary once approved. */
function ItemCard({ itemKey, title, approved, summary, children, registerCard, onApprove, onEdit, onRemove, removeLabel }: ItemCardProps) {
  return (
    <article
      ref={(element) => registerCard(itemKey, element)}
      className={cn("rounded-lg border bg-surface p-5 sm:p-6", approved ? "border-fit-bar" : "border-line")}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h4 data-card-heading tabIndex={-1} className="text-lg">
          {title}
        </h4>
        {approved && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
            <CheckIcon className="size-5" />
            Approved
          </p>
        )}
      </div>

      {approved ? (
        <>
          <p className="mt-2 text-sm break-words text-text-muted">{summary}</p>
          {/* The negative margin lines the text up with the summary above (quiet buttons keep their padding). */}
          <Button variant="quiet" className="mt-2 -ml-5" onClick={() => onEdit(itemKey)}>
            Edit<span className="sr-only"> {title}</span>
          </Button>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-4">{children}</div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => onApprove(itemKey)}>
              Approve<span className="sr-only"> {title}</span>
            </Button>
            {onRemove && (
              <Button variant="quiet" onClick={onRemove}>
                {removeLabel ?? "Remove"}
              </Button>
            )}
          </div>
        </>
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
  currentLabel: string;
  optional?: boolean;
  errors: FieldErrors;
  onChange: (change: { startDate?: string; endDate?: string; current?: boolean }) => void;
};

function MonthRange({ start, end, current, currentLabel, optional, errors, onChange }: MonthRangeProps) {
  const suffix = optional ? " (optional)" : "";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Started${suffix}`} hint="Month and year" error={errors.startDate}>
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
          <Field label={`Finished${suffix}`} hint="Month and year" error={errors.endDate}>
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

// --- Summaries --------------------------------------------------------------------------------

function contactSummary(value: ContactDraft): string {
  // Non-breaking spaces keep the phone number on one line on a narrow screen.
  const phone = tidyPhone(value.phone).replace(/ /g, " ");
  return [value.fullName, value.email, phone, value.location, value.linkedIn].filter((part) => part.trim()).join(" · ");
}

function jobTitle(value: ExperienceDraft): string {
  const title = value.title.trim() || "New job";
  return value.company.trim() ? `${title} at ${value.company.trim()}` : title;
}

function experienceSummary(value: ExperienceDraft): string {
  const lines = (text: string) => text.split("\n").filter((line) => line.trim()).length;
  return [
    formatPeriod(value.startDate, value.current ? null : value.endDate),
    count(lines(value.duties), "duty", "duties"),
    count(lines(value.achievements), "achievement"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function courseTitle(value: EducationDraft): string {
  return `${value.qualification.trim()} ${value.subject.trim()}`.trim() || "New qualification";
}

function educationSummary(value: EducationDraft): string {
  return (
    [
      value.institution,
      formatPeriod(value.startDate || undefined, value.current ? null : value.endDate || undefined),
      // Labelled, so "2:1" or "Merit" on its own isn't a puzzle.
      value.grade.trim() && `Grade: ${value.grade.trim()}`,
    ]
      .filter((part) => part?.trim())
      .join(" · ") || "No details."
  );
}

function shorten(text: string, length: number): string {
  const clean = text.trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

// --- Order and lookup -------------------------------------------------------------------------

/** The items in the order they appear on the page. */
function entryOrder(draft: ReviewDraft): string[] {
  return [
    draft.contact.key,
    draft.summary.key,
    ...draft.experience.map((item) => item.key),
    ...draft.education.map((item) => item.key),
    ...draft.certifications.map((item) => item.key),
    draft.skills.key,
  ];
}

function isApproved(draft: ReviewDraft, key: string): boolean {
  const all = [draft.contact, draft.summary, draft.skills, ...draft.experience, ...draft.education, ...draft.certifications];
  return all.find((item) => item.key === key)?.approved ?? false;
}
