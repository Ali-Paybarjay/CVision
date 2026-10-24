"use client";

import { useState } from "react";
import type { JobPreferences } from "@/shared/contracts";
import { Button, Field, Input, Notice, Select } from "@/shared/ui";
import {
  contractTypeOptions,
  draftFromPreferences,
  hoursOptions,
  preferencesFromDraft,
  salaryPeriodOptions,
  workModeOptions,
  type PreferencesDraft,
  type PreferencesErrors,
  type SalaryPeriod,
} from "../preferences";

type PreferencesFormProps = {
  preferences: JobPreferences;
  /** Saves the preferences; resolves to a message for the user if it couldn't. */
  onSave: (preferences: JobPreferences) => Promise<string | null>;
  onCancel: () => void;
};

/** What kind of work the user is looking for: place, way of working, contract, hours and pay. */
export function PreferencesForm({ preferences, onSave, onCancel }: PreferencesFormProps) {
  const [draft, setDraft] = useState<PreferencesDraft>(() => draftFromPreferences(preferences));
  const [errors, setErrors] = useState<PreferencesErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = (next: Partial<PreferencesDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setErrors((current) => {
      const left = { ...current };
      for (const key of Object.keys(next)) delete left[key as keyof PreferencesErrors];
      return left;
    });
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = preferencesFromDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      setProblem(await onSave(result.preferences));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="mt-4 flex flex-col gap-5" aria-busy={saving}>
      <Field label="Where you want to work" hint="A town, city or postcode">
        {(props) => <Input {...props} value={draft.location} onChange={(event) => change({ location: event.target.value })} />}
      </Field>

      <Choices legend="How you want to work" options={workModeOptions} chosen={draft.workModes} onChange={(workModes) => change({ workModes })} />
      <Choices legend="Contract" options={contractTypeOptions} chosen={draft.contractTypes} onChange={(contractTypes) => change({ contractTypes })} />
      <Choices legend="Hours" options={hoursOptions} chosen={draft.hours} onChange={(hours) => change({ hours })} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Pay you’re looking for (optional)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From" error={errors.minimumPay}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                placeholder="£30,000"
                value={draft.minimumPay}
                onChange={(event) => change({ minimumPay: event.target.value })}
              />
            )}
          </Field>
          <Field label="To" error={errors.maximumPay}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                placeholder="£35,000"
                value={draft.maximumPay}
                onChange={(event) => change({ maximumPay: event.target.value })}
              />
            )}
          </Field>
          <Field label="Per">
            {(props) => (
              <Select {...props} value={draft.payPeriod} onChange={(event) => change({ payPeriod: event.target.value as SalaryPeriod })}>
                {salaryPeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label.replace(/^an? /, "")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </fieldset>

      {problem && (
        <Notice tone="error" title="Your preferences aren’t saved">
          {problem}
        </Notice>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save preferences"}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Choices<T extends string>({
  legend,
  options,
  chosen,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  chosen: T[];
  onChange: (chosen: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={chosen.includes(option.value)}
              onChange={(event) =>
                onChange(event.target.checked ? [...chosen, option.value] : chosen.filter((value) => value !== option.value))
              }
              className="size-5 shrink-0 accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
