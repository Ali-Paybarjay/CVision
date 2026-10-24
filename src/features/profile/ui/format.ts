import type { ContractType, Hours, Job, Salary, WorkMode } from "@/shared/contracts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-06" → "Jun 2025". Anything else is returned as it is. */
export function formatMonth(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : value;
}

/** "Jun 2025 to Sep 2025", "Mar 2025 to now". */
export function formatPeriod(start: string | undefined, end: string | null | undefined): string {
  const from = formatMonth(start);
  const to = end === null ? "now" : formatMonth(end);
  if (from && to) return `${from} to ${to}`;
  return from || to;
}

/** "1 skill", "3 skills". */
export function count(amount: number, singular: string, plural = `${singular}s`): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

/** "20 October 2026", from an ISO date and time. */
export function formatDay(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "£29,000 to £32,000 a year", "£450 a day", "Up to £14 an hour". */
export function formatSalary(salary: Salary | null): string {
  if (!salary) return "";
  const pounds = (amount: number) =>
    amount.toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  const period = { year: "a year", day: "a day", hour: "an hour" }[salary.period];
  const { min, max } = salary;
  let range: string;
  if (min !== undefined && max !== undefined) range = min === max ? pounds(min) : `${pounds(min)} to ${pounds(max)}`;
  else if (min !== undefined) range = `From ${pounds(min)}`;
  else if (max !== undefined) range = `Up to ${pounds(max)}`;
  else return "";
  return `${range} ${period}${salary.isEstimate ? " (estimate)" : ""}`;
}

/** The facts the ad gives, in reading order: location, pay, contract, hours and where the work is done. */
export function jobFacts(job: Job): string[] {
  const contract: Record<ContractType, string> = {
    permanent: "Permanent",
    "fixed-term": "Fixed-term",
    contract: "Contract",
    temporary: "Temporary",
  };
  const hours: Record<Hours, string> = { "full-time": "Full-time", "part-time": "Part-time" };
  const mode: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", "on-site": "On-site" };
  return [
    job.location,
    formatSalary(job.salary),
    job.contractType && contract[job.contractType],
    job.hours && hours[job.hours],
    // "Remote (UK)" as the location already says it.
    job.workMode && !job.location.toLowerCase().includes(mode[job.workMode].toLowerCase()) && mode[job.workMode],
  ].filter((fact): fact is string => Boolean(fact));
}
