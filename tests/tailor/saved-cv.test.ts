import { describe, expect, it } from "vitest";
import { applyApprovedChanges, savedCvLayout } from "@/features/tailor/saved-cv";
import { buildTailoredCv } from "@/features/tailor/tailored-cv";
import type { TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const { profile, jobs } = personas.sara;
const job = jobs[0];

let next = 0;
const change = (section: TailoringChange["section"], before: string | null, after: string, status: TailoringChange["status"] = "approved"): TailoringChange => ({
  id: `c${++next}`,
  jobId: job.id,
  section,
  before,
  after,
  evidence: "From the CV.",
  evidenceSource: "cv",
  status,
});

const changes = [
  change("summary", profile.summary, "Data science graduate who turns retail sales data into clear weekly reports."),
  change("experience", profile.experience[0].duties[1], "Built Tableau dashboards that the regional sales team used every Monday"),
  change("experience", null, "Explained the dashboards to store managers"),
  change("skills", null, "Communication"),
  change("education", "MSc, Data Science, University of Manchester, Merit", "MSc Data Science (Merit), University of Manchester"),
  change("skills", "SQL", "SQL (advanced)", "rejected"),
  change("skills", "Excel", "Excel (VBA)", "proposed"),
  // A new line whose evidence names an older role goes under that role (#446).
  { ...change("experience", null, "Trained new starters on the tills"), evidence: "I trained new starters on the tills at Greenway Foods.", evidenceSource: "follow-up-answer" as const },
];
const approved = changes.filter((item) => item.status === "approved");
const saved = { id: "s1", jobId: job.id, cv: applyApprovedChanges(profile, approved), changes: approved, coverLetter: null, savedAt: "2026-11-04T12:00:00.000Z" };

describe("the CV as it was sent (#207)", () => {
  it("writes only the approved text changes into the Profile", () => {
    const cv = saved.cv;
    expect(cv.summary).toBe(changes[0].after);
    expect(cv.experience[0].duties).toContain(changes[1].after);
    expect(cv.experience[0].duties).not.toContain(profile.experience[0].duties[1]);
    expect(cv.experience[0].duties.at(-1)).toBe("Explained the dashboards to store managers");
    expect(cv.experience[1].duties.at(-1)).toBe("Trained new starters on the tills");
    expect(cv.experience[0].duties).not.toContain("Trained new starters on the tills");
    expect(cv.skills).toContain("Communication");
    // Rejected and undecided changes never go in.
    expect(cv.skills).toContain("SQL");
    expect(cv.skills).toContain("Excel");
    // Education is structured, so its change stays in `changes` only.
    expect(cv.education).toEqual(profile.education);
  });

  it("leaves the Profile it was given unchanged", () => {
    expect(profile.summary).not.toBe(changes[0].after);
    expect(profile.skills).not.toContain("Communication");
  });

  it("shows exactly the CV the Tailor page showed, tailored lines marked, even after the Profile changes", () => {
    const live = buildTailoredCv(profile, changes, job);
    const again = savedCvLayout(saved, job);
    expect(again.summary).toEqual(live.summary);
    expect(again.experience).toEqual(live.experience);
    expect(again.skills).toEqual(live.skills);
    expect(again.education).toEqual(live.education);
    expect(again.unplaced).toEqual([]);
    expect(again.education.some((line) => line.tailored)).toBe(true);
  });
});
