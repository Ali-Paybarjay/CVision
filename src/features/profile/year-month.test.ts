import { describe, expect, it } from "vitest";
import { EARLIEST_YEAR, joinYearMonth, splitYearMonth, yearChoices, yearMonthProblem } from "./year-month";

// The Month and Year menus of the profile's dates (#186): what each part holds, and what the Year menu offers.

describe("year and month parts", () => {
  it("splits a whole date, a half-chosen one and an empty one, and joins them back unchanged", () => {
    for (const value of ["2021-09", "2021-", "-09", ""]) {
      expect(joinYearMonth(splitYearMonth(value))).toBe(value);
    }
    expect(splitYearMonth("2021-09")).toEqual({ year: "2021", month: "09" });
    expect(splitYearMonth("2021-")).toEqual({ year: "2021", month: "" });
    expect(splitYearMonth("-09")).toEqual({ year: "", month: "09" });
  });

  it("shows nothing chosen for a date it can't read, rather than a wrong month", () => {
    expect(splitYearMonth("Sept 2021")).toEqual({ year: "", month: "" });
    expect(splitYearMonth("2021-13")).toEqual({ year: "", month: "" });
  });

  it("names what is missing from a date", () => {
    expect(yearMonthProblem("2021-09")).toBeNull();
    expect(yearMonthProblem(" 2021-09 ")).toBeNull();
    expect(yearMonthProblem("")).toBe("missing");
    expect(yearMonthProblem("2021-")).toBe("month");
    expect(yearMonthProblem("-09")).toBe("year");
    expect(yearMonthProblem("2021-13")).toBe("unreadable");
  });
});

describe("the Year menu", () => {
  it("lists the years newest first, from the latest year down to the earliest", () => {
    const years = yearChoices(2026);

    expect(years[0]).toBe("2026");
    expect(years.at(-1)).toBe(String(EARLIEST_YEAR));
    expect(years).toHaveLength(2026 - EARLIEST_YEAR + 1);
  });

  it("keeps a chosen year outside the range in its place, so the menu shows what the profile says", () => {
    expect(yearChoices(2026, "1955").slice(-2)).toEqual([String(EARLIEST_YEAR), "1955"]);
    expect(yearChoices(2026, "2028").slice(0, 2)).toEqual(["2028", "2026"]);
    expect(yearChoices(2026, "2001").filter((year) => year === "2001")).toHaveLength(1);
  });
});
