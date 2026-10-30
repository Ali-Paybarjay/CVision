import { useId } from "react";
import { ErrorIcon, Select } from "@/shared/ui";
import { joinYearMonth, splitYearMonth, yearChoices } from "../year-month";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type MonthYearFieldProps = {
  /** The group's name, for example "Started". */
  legend: string;
  hint?: string;
  error?: string;
  /** YYYY-MM, "YYYY-" or "-MM" while one part is chosen, or "". */
  value: string;
  /** The newest year in the Year menu: this year, or later for a course that hasn't finished yet. */
  latestYear: number;
  onChange: (value: string) => void;
};

/**
 * A month and year chosen from two menus, the same in every browser and with nothing to type (#186). The menus
 * sit in a group named by the legend; the hint and the error belong to both. Each part is kept on its own, so
 * choosing only the month or only the year never clears the other.
 */
export function MonthYearField({ legend, hint, error, value, latestYear, onChange }: MonthYearFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const { year, month } = splitYearMonth(value);
  // Only the missing part is marked, unless both are chosen and the date itself is the problem.
  const invalid = (part: string) => (error && (!part || (year && month)) ? true : undefined);

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {hint && (
          <p id={hintId} className="text-sm text-text-muted">
            {hint}
          </p>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-2">
          <div>
            <label htmlFor={`${id}-month`} className="sr-only">
              Month
            </label>
            <Select
              id={`${id}-month`}
              value={month}
              aria-describedby={describedBy}
              aria-invalid={invalid(month)}
              onChange={(event) => onChange(joinYearMonth({ year, month: event.target.value }))}
            >
              <option value="">Month</option>
              {MONTHS.map((name, index) => (
                <option key={name} value={String(index + 1).padStart(2, "0")}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor={`${id}-year`} className="sr-only">
              Year
            </label>
            <Select
              id={`${id}-year`}
              value={year}
              aria-describedby={describedBy}
              aria-invalid={invalid(year)}
              onChange={(event) => onChange(joinYearMonth({ year: event.target.value, month }))}
            >
              <option value="">Year</option>
              {yearChoices(latestYear, year).map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {error && (
          <p id={errorId} className="flex items-center gap-1.5 text-sm text-error">
            <ErrorIcon className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </fieldset>
  );
}
