import { describe, expect, it } from "vitest";
import { ApplicationStatusSchema, type Application, type ApplicationStatus } from "@/shared/contracts";
import {
  ApplicationChangeSchema,
  addDays,
  applyChange,
  canCloseWithoutNews,
  closeChosen,
  closingDate,
  daysBetween,
  daysWithoutNews,
  formatDate,
  formatDay,
  londonToday,
  markNoResponse,
  nextStepDue,
  openAndClosed,
  suggestClosing,
  whenOptions,
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

  it("sets, keeps and clears the next step's date (#211)", () => {
    const dated = { ...applied, nextStepDate: "2026-10-20" };
    expect(applyChange(applied, { status: "applied", nextStep: "Call back", nextStepDate: "2026-10-24" }, "2026-10-22")).toEqual({
      ...applied,
      nextStepDate: "2026-10-24",
    });
    // A new status alone keeps it, whether the change sends the same date (Keep) or none at all.
    expect(applyChange(dated, { status: "interview", nextStep: "Call back", nextStepDate: "2026-10-20" }, "2026-10-22").nextStepDate).toBe("2026-10-20");
    expect(applyChange(dated, { status: "interview", nextStep: "Call back" }, "2026-10-22").nextStepDate).toBe("2026-10-20");
    // No date clears it, and so does clearing the next step, whatever date comes with it.
    expect(applyChange(dated, { status: "applied", nextStep: "Call back", nextStepDate: null }, "2026-10-22")).toEqual(applied);
    expect(applyChange(dated, { status: "applied", nextStep: null, nextStepDate: "2026-10-24" }, "2026-10-22")).toEqual({ ...applied, nextStep: null });
  });
});

describe("the When menu (#211)", () => {
  const today = "2026-10-29";

  it("offers No date, then today and every day for two weeks, each with its day and date", () => {
    const options = whenOptions(today, null);

    expect(options).toHaveLength(16);
    expect(options.slice(0, 4)).toEqual([
      { value: "", label: "No date" },
      { value: "2026-10-29", label: "Today · Thu 29 Oct" },
      { value: "2026-10-30", label: "Tomorrow · Fri 30 Oct" },
      { value: "2026-10-31", label: "In 2 days · Sat 31 Oct" },
    ]);
    expect(options.at(-1)).toEqual({ value: "2026-11-12", label: "In 14 days · Thu 12 Nov" });
  });

  it("keeps a saved date that is not in the list, first, so a status change alone never drops it", () => {
    expect(whenOptions(today, "2026-10-26")[0]).toEqual({ value: "2026-10-26", label: "Keep · Mon 26 Oct" });
    expect(whenOptions(today, "2026-11-13")[0]).toEqual({ value: "2026-11-13", label: "Keep · Fri 13 Nov" });
    // A saved date in the list is simply chosen there.
    expect(whenOptions(today, "2026-11-12").map((option) => option.label)).not.toContain("Keep · Thu 12 Nov");
    expect(whenOptions(today, "2026-11-12")).toHaveLength(16);
  });
});

describe("nextStepDue (#211)", () => {
  const dated = (date: string, status: ApplicationStatus = "applied"): Application => ({ ...applied, status, nextStepDate: date });

  it("says whether the next step is overdue, due today, tomorrow or later, by London's today", () => {
    expect(nextStepDue(dated("2026-10-26"), "2026-10-29")).toEqual({ date: "2026-10-26", when: "overdue" });
    expect(nextStepDue(dated("2026-10-29"), "2026-10-29")?.when).toBe("today");
    expect(nextStepDue(dated("2026-10-30"), "2026-10-29")?.when).toBe("tomorrow");
    expect(nextStepDue(dated("2026-11-06"), "2026-10-29")?.when).toBe("later");
  });

  it("only shows the date on a closed application, and nothing without a date or a next step", () => {
    expect(nextStepDue(dated("2026-10-26", "rejected"), "2026-10-29")?.when).toBe("closed");
    expect(nextStepDue(applied, "2026-10-29")).toBeNull();
    expect(nextStepDue({ ...dated("2026-10-26"), nextStep: null }, "2026-10-29")).toBeNull();
  });
});

describe("ApplicationChangeSchema", () => {
  it("trims the next step and saves an empty one as null", () => {
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "  Reply by Monday " })).toEqual({ status: "offer", nextStep: "Reply by Monday" });
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "   " })).toEqual({ status: "offer", nextStep: null });
  });

  it("saves No date as null, and leaves out a date that was not sent", () => {
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "Reply", nextStepDate: "" }).nextStepDate).toBeNull();
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "Reply", nextStepDate: "2026-10-31" }).nextStepDate).toBe("2026-10-31");
    expect(ApplicationChangeSchema.parse({ status: "offer", nextStep: "Reply" })).not.toHaveProperty("nextStepDate");
    expect(ApplicationChangeSchema.safeParse({ status: "offer", nextStep: "Reply", nextStepDate: "Friday" }).success).toBe(false);
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
    expect(formatDay("2026-10-26")).toBe("Mon 26 Oct");
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

describe("closeChosen", () => {
  const today = "2026-10-25";
  const ticked = tracked(application("applied", "2026-08-24", "ticked"));
  const unticked = tracked(application("interview", "2026-08-21", "unticked"));

  it("closes only the ticked row, and the other suggested row stays as it was", () => {
    const items = [ticked, unticked];
    expect(suggestClosing(items, today)).toEqual(items);

    expect(closeChosen(items, ["ticked"], today)).toEqual([{ ...ticked.application, status: "no_response", date: today }]);
    expect(unticked.application).toEqual(application("interview", "2026-08-21", "unticked"));
    expect(closeChosen(items, ["unticked"], today).map((item) => item.id)).toEqual(["unticked"]);
  });

  it("closes nothing when nothing is ticked", () => {
    expect(closeChosen([ticked, unticked], [], today)).toEqual([]);
  });

  it("leaves out a ticked row the server would refuse: ready, offer, closed or with news within 60 days", () => {
    const items = [
      tracked(application("ready", "2025-01-01", "ready")),
      tracked(application("offer", "2025-01-01", "offer")),
      tracked(application("rejected", "2025-01-01", "closed")),
      tracked(application("applied", "2026-08-27", "fifty-nine-days")),
    ];

    expect(closeChosen(items, items.map((item) => item.application.id), today)).toEqual([]);
  });
});

describe("openAndClosed", () => {
  it("puts every closed status in its own list and keeps the order within each", () => {
    const statuses: ApplicationStatus[] = ["rejected", "applied", "no_response", "ready", "accepted", "interview", "withdrawn", "offer"];
    const { open, closed } = openAndClosed(statuses.map((status) => tracked(application(status, "2026-10-20"))));

    expect(open.map((item) => item.application.status)).toEqual(["applied", "ready", "interview", "offer"]);
    expect(closed.map((item) => item.application.status)).toEqual(["rejected", "no_response", "accepted", "withdrawn"]);
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
