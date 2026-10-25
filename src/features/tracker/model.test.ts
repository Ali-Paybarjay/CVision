import { describe, expect, it } from "vitest";
import { ApplicationStatusSchema, type Application, type ApplicationStatus } from "@/shared/contracts";
import {
  ApplicationChangeSchema,
  addDays,
  applyChange,
  canCloseWithoutNews,
  closedLast,
  closingDate,
  daysBetween,
  daysWithoutNews,
  formatDate,
  londonToday,
  markNoResponse,
  suggestClosing,
  type TrackedApplication,
} from "./model";

const applied: Application = { id: "a-1", jobId: "job-1", date: "2026-10-15", status: "applied", nextStep: "Call back" };

describe("applyChange", () => {
  it("moves the date to today when the status changes", () => {
    expect(applyChange(applied, { status: "interview", nextStep: "Prepare" }, "2026-10-22")).toEqual({
      ...applied,
      status: "interview",
      nextStep: "Prepare",
      date: "2026-10-22",
    });
  });

  it("keeps the date when only the next step changes", () => {
    expect(applyChange(applied, { status: "applied", nextStep: null }, "2026-10-22")).toEqual({ ...applied, nextStep: null });
  });
});

describe("ApplicationChangeSchema", () => {
  it("trims the next step and saves an empty one as null", () => {
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "  Reply by Monday " })).toEqual({ status: "offer", nextStep: "Reply by Monday" });
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "   " })).toEqual({ status: "offer", nextStep: null });
  });

  it("refuses an unknown status and a next step over 200 characters", () => {
    expect(ApplicationChangeSchema.safeParse({ status: "hired", nextStep: "" }).success).toBe(false);
    expect(ApplicationChangeSchema.safeParse({ status: "offer", nextStep: "x".repeat(201) }).success).toBe(false);
    expect(ApplicationChangeSchema.safeParse({ status: "offer", nextStep: "x".repeat(200) }).success).toBe(true);
  });
});

describe("dates", () => {
  it("formats a calendar date the UK way", () => {
    expect(formatDate("2026-10-22")).toBe("22 Oct 2026");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("gives today's date in London, not UTC", () => {
    expect(londonToday(new Date("2026-10-21T23:30:00Z"))).toBe("2026-10-22");
    expect(londonToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("follows London when the clocks go back on Sunday 25 October 2026", () => {
    // Midnight is 23:00 UTC before the change and 00:00 UTC after it; the 25th has 25 hours.
    expect(londonToday(new Date("2026-10-24T22:59:59Z"))).toBe("2026-10-24");
    expect(londonToday(new Date("2026-10-24T23:00:00Z"))).toBe("2026-10-25");
    expect(londonToday(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
    expect(londonToday(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });

  it("counts whole calendar days, whatever the clocks do", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-08-27", "2026-10-26")).toBe(60);
    expect(daysBetween("2026-10-26", "2026-10-24")).toBe(-2);
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-03-30", -2)).toBe("2026-03-28");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

const application = (status: ApplicationStatus, date: string, id = `a-${status}`): Application => ({ id, jobId: `job-${id}`, date, status, nextStep: null });
const tracked = (item: Application, deadline?: string | null): TrackedApplication => ({
  application: item,
  job: { title: "Data Analyst", company: "Etherow Freight", deadline },
});

describe("days without news", () => {
  it("counts from the application's date for applied and interview", () => {
    expect(daysWithoutNews(application("applied", "2026-10-16"), "2026-10-25")).toBe(9);
    expect(daysWithoutNews(application("interview", "2026-10-20"), "2026-10-25")).toBe(5);
    expect(daysWithoutNews(application("applied", "2026-10-25"), "2026-10-25")).toBe(0);
  });

  it("is never counted for ready, offer or a closed application", () => {
    for (const status of ["ready", "offer", "accepted", "rejected", "no_response", "withdrawn"] as const) {
      expect(daysWithoutNews(application(status, "2026-01-01"), "2026-10-25")).toBeNull();
    }
  });
});

describe("suggestClosing", () => {
  const today = "2026-10-25";

  it("suggests applied and interview rows with no news for 60 days or more, in the list's order", () => {
    const items = [
      tracked(application("interview", "2026-08-01", "old-interview")),
      tracked(application("applied", "2026-08-26", "sixty-days")),
      tracked(application("applied", "2026-08-27", "fifty-nine-days")),
    ];

    expect(suggestClosing(items, today).map((item) => item.application.id)).toEqual(["old-interview", "sixty-days"]);
  });

  it("never suggests a ready or closed row, however old", () => {
    const old = "2025-01-01";
    const items = ApplicationStatusSchema.options.filter((status) => status !== "applied" && status !== "interview").map((status) => tracked(application(status, old)));

    expect(suggestClosing(items, today)).toEqual([]);
    expect(items.map((item) => canCloseWithoutNews(item.application, today))).not.toContain(true);
  });

  it("puts the 60-day line at midnight in London, on the day the clocks go back too", () => {
    const sixtyOn25th = application("applied", "2026-08-26");
    const sixtyOn26th = application("applied", "2026-08-27");

    // 00:30 in London on the 25th, still 24 October in UTC.
    const justAfterMidnight = londonToday(new Date("2026-10-24T23:30:00Z"));
    expect(canCloseWithoutNews(sixtyOn25th, justAfterMidnight)).toBe(true);
    // 23:30 in London on the 25th, after the clocks went back: still the 25th, not the 26th.
    const lateOn25th = londonToday(new Date("2026-10-25T23:30:00Z"));
    expect(canCloseWithoutNews(sixtyOn26th, lateOn25th)).toBe(false);
    expect(canCloseWithoutNews(sixtyOn26th, londonToday(new Date("2026-10-26T00:00:00Z")))).toBe(true);
  });
});

describe("markNoResponse", () => {
  it("changes only the status and the date, and keeps every other field", () => {
    const saved = {
      ...application("interview", "2026-08-01"),
      nextStep: "Wait for the panel's decision",
      followUps: [{ kind: "thank-you" as const, date: "2026-08-02" }],
      addedLater: { kept: true },
    };

    expect(markNoResponse(saved, "2026-10-25")).toEqual({ ...saved, status: "no_response", date: "2026-10-25" });
  });
});

describe("closedLast", () => {
  it("puts every closed status at the bottom and keeps the order within each group", () => {
    const statuses: ApplicationStatus[] = ["rejected", "applied", "no_response", "ready", "accepted", "interview", "withdrawn", "offer"];
    const items = statuses.map((status) => tracked(application(status, "2026-10-20")));

    expect(closedLast(items).map((item) => item.application.status)).toEqual([
      "applied",
      "ready",
      "interview",
      "offer",
      "rejected",
      "no_response",
      "accepted",
      "withdrawn",
    ]);
  });
});

describe("closingDate", () => {
  const ready = application("ready", "2026-10-20");

  it("is nothing when the ad gave no closing date", () => {
    expect(closingDate(ready, tracked(ready).job, "2026-10-25")).toBeNull();
    expect(closingDate(ready, tracked(ready, null).job, "2026-10-25")).toBeNull();
    expect(closingDate(ready, null, "2026-10-25")).toBeNull();
  });

  it("only shows the date once the application has been sent", () => {
    for (const status of ["applied", "interview", "offer", "rejected", "no_response", "withdrawn", "accepted"] as const) {
      const item = tracked(application(status, "2026-10-20"), "2026-10-26");
      expect(closingDate(item.application, item.job, "2026-10-25")).toEqual({ deadline: "2026-10-26", alert: "date" });
    }
  });

  it("warns a ready application from 7 days before the closing date, by London's calendar", () => {
    const { job } = tracked(ready, "2026-11-01");

    // 23:59 in London on 24 October: 8 days left.
    expect(closingDate(ready, job, londonToday(new Date("2026-10-24T22:59:59Z")))).toEqual({ deadline: "2026-11-01", alert: "open" });
    // Midnight in London on 25 October, still the 24th in UTC: 7 days left.
    expect(closingDate(ready, job, londonToday(new Date("2026-10-24T23:00:00Z")))).toEqual({ deadline: "2026-11-01", alert: "soon", daysLeft: 7 });
    expect(closingDate(ready, job, "2026-10-31")).toEqual({ deadline: "2026-11-01", alert: "soon", daysLeft: 1 });
  });

  it("says it closes today on the closing date and that it has passed from the next day in London", () => {
    const { job } = tracked(ready, "2026-10-25");

    // 23:30 in London on the 25th, after the clocks went back.
    expect(closingDate(ready, job, londonToday(new Date("2026-10-25T23:30:00Z")))).toEqual({ deadline: "2026-10-25", alert: "soon", daysLeft: 0 });
    expect(closingDate(ready, job, londonToday(new Date("2026-10-26T00:00:00Z")))).toEqual({ deadline: "2026-10-25", alert: "passed" });
  });
});
