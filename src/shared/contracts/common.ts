import { z } from "zod";

/** Calendar month on a CV, e.g. "2021-09". */
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

/** Calendar date, e.g. "2026-10-21". */
export const DateSchema = z.iso.date();

/** Date and time in UTC, e.g. "2026-10-21T09:30:00Z". */
export const DateTimeSchema = z.iso.datetime();

export const IdSchema = z.string().min(1);

/** UK contract types used in job ads and in the user's preferences. */
export const ContractTypeSchema = z.enum(["permanent", "fixed-term", "contract", "temporary"]);
export type ContractType = z.infer<typeof ContractTypeSchema>;

export const WorkModeSchema = z.enum(["remote", "hybrid", "on-site"]);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const HoursSchema = z.enum(["full-time", "part-time"]);
export type Hours = z.infer<typeof HoursSchema>;

/** Pay in pounds. Either end may be missing; an ad with no pay at all uses null instead. */
export const SalarySchema = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  currency: z.literal("GBP"),
  period: z.enum(["year", "day", "hour"]),
  /** True when the number is an estimate (Adzuna does this in phase 2), not the employer's figure. */
  isEstimate: z.boolean().default(false),
});
export type Salary = z.infer<typeof SalarySchema>;
