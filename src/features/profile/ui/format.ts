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
