import { describe, expect, it } from "vitest";
import type { Application } from "@/shared/contracts";
import { ApplicationChangeSchema, applyChange, formatDate, londonToday } from "./model";

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
});
