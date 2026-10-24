import {
  JobPreferencesSchema,
  type ContractType,
  type Hours,
  type JobPreferences,
  type Salary,
  type WorkMode,
} from "@/shared/contracts";

// Job preferences: what kind of work the user is looking for. A CV doesn't hold them, so the user sets them
// on the profile page. Pure functions, so the form only renders this state and tests cover the rules.

export const workModeOptions: { value: WorkMode; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
];

export const contractTypeOptions: { value: ContractType; label: string }[] = [
  { value: "permanent", label: "Permanent" },
  { value: "fixed-term", label: "Fixed-term" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
];

export const hoursOptions: { value: Hours; label: string }[] = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
];

export type SalaryPeriod = Salary["period"];

export const salaryPeriodOptions: { value: SalaryPeriod; label: string }[] = [
  { value: "year", label: "a year" },
  { value: "day", label: "a day" },
  { value: "hour", label: "an hour" },
];

/** The preferences form, as typed. */
export type PreferencesDraft = {
  location: string;
  workModes: WorkMode[];
  contractTypes: ContractType[];
  hours: Hours[];
  /** The pay the user is looking for, as typed: "30000", "£30,000" or "30k". Either can be empty. */
  minimumPay: string;
  maximumPay: string;
  payPeriod: SalaryPeriod;
};

export function draftFromPreferences(preferences: JobPreferences): PreferencesDraft {
  return {
    location: preferences.location,
    workModes: [...preferences.workModes],
    contractTypes: [...preferences.contractTypes],
    hours: [...preferences.hours],
    minimumPay: preferences.salary?.min?.toString() ?? "",
    maximumPay: preferences.salary?.max?.toString() ?? "",
    payPeriod: preferences.salary?.period ?? "year",
  };
}

export type PreferencesErrors = { minimumPay?: string; maximumPay?: string };
export type PreferencesResult = { ok: true; preferences: JobPreferences } | { ok: false; errors: PreferencesErrors };

/** The form as JobPreferences, or what to fix. Choices keep their order, without repeats. */
export function preferencesFromDraft(draft: PreferencesDraft): PreferencesResult {
  const errors: PreferencesErrors = {};
  const pay = (text: string, field: keyof PreferencesErrors) => {
    if (!text.trim()) return undefined;
    const amount = readPounds(text);
    if (amount === null) errors[field] = "Enter an amount in pounds, for example 30000.";
    return amount ?? undefined;
  };
  const min = pay(draft.minimumPay, "minimumPay");
  const max = pay(draft.maximumPay, "maximumPay");
  if (min !== undefined && max !== undefined && max < min) errors.maximumPay = "This is less than the lowest pay.";
  if (errors.minimumPay || errors.maximumPay) return { ok: false, errors };

  const salary: Salary | null =
    min === undefined && max === undefined ? null : { min, max, currency: "GBP", period: draft.payPeriod, isEstimate: false };
  const unique = <T>(chosen: T[]) => [...new Set(chosen)];

  return {
    ok: true,
    preferences: JobPreferencesSchema.parse({
      salary,
      location: draft.location.trim(),
      workModes: unique(draft.workModes),
      contractTypes: unique(draft.contractTypes),
      hours: unique(draft.hours),
    }),
  };
}

/** "30000", "£30,000", "30k" and "12.50" in pounds; null for anything else, or for nothing at all. */
export function readPounds(text: string): number | null {
  const match = /^£?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(k)?$/i.exec(text.trim());
  if (!match) return null;
  const amount = Number(`${match[1].replace(/,/g, "")}${match[2] ?? ""}`) * (match[3] ? 1000 : 1);
  return amount > 0 && amount <= 1_000_000 ? amount : null;
}

/** Plain lines for the profile overview, or an empty list when nothing is set. */
export function describePreferences(preferences: JobPreferences): string[] {
  const labels = <T>(options: { value: T; label: string }[], chosen: T[]) =>
    options.filter((option) => chosen.includes(option.value)).map((option) => option.label);
  const either = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words.join(""));
  const salary = preferences.salary;
  const pounds = (amount: number) =>
    amount.toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 });
  const period = salaryPeriodOptions.find((option) => option.value === salary?.period)?.label ?? "";
  let pay = "";
  if (salary?.min !== undefined && salary.max !== undefined && salary.max !== salary.min) {
    pay = `${pounds(salary.min)} to ${pounds(salary.max)} ${period}`;
  } else if (salary?.min !== undefined) {
    pay = `At least ${pounds(salary.min)} ${period}`;
  } else if (salary?.max !== undefined) {
    pay = `Up to ${pounds(salary.max)} ${period}`;
  }

  return [
    preferences.location,
    either(labels(workModeOptions, preferences.workModes)),
    either(labels(contractTypeOptions, preferences.contractTypes)),
    either(labels(hoursOptions, preferences.hours)),
    pay,
  ].filter((line) => line !== "");
}
