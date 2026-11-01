import { describe, expect, it } from "vitest";
import { buildTailoredCv, fitsCv, formatMonth, otherLines } from "@/features/tailor/tailored-cv";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const profile = personas.sara.profile;

function change(status: TailoringStatus, overrides: Partial<TailoringChange> = {}): TailoringChange {
  return {
    id: `change-${status}-${overrides.section ?? "experience"}-${overrides.after ?? ""}`,
    jobId: "sara-job-1",
    gapId: "sara-gap-1",
    section: "experience",
    before: "Built Tableau dashboards for the regional sales team",
    after: "Built Tableau dashboards for the regional sales team and walked the managers through them every Monday",
    evidence: "Every Monday I walked the regional managers through the dashboard",
    evidenceSource: "follow-up-answer",
    status,
    ...overrides,
  };
}

/** Every line of the CV as plain text. */
function allText(cv: ReturnType<typeof buildTailoredCv>): string[] {
  return [
    cv.summary?.text ?? "",
    ...cv.skills.map((line) => line.text),
    ...cv.technicalSkills.map((line) => line.text),
    ...cv.experience.flatMap((job) => job.lines.map((line) => line.text)),
    ...cv.education.map((line) => line.text),
    ...cv.certifications.map((line) => line.text),
  ];
}

describe("the tailored CV (You approve everything)", () => {
  it("with no changes, is the CV as the user wrote it", () => {
    const cv = buildTailoredCv(profile, []);
    expect(cv.fullName).toBe(profile.fullName);
    expect(cv.skills).toEqual([]);
    expect(cv.technicalSkills.map((line) => line.text)).toEqual(profile.skills.slice(0, 4));
    expect(allText(cv).some((text) => text.includes("Built Tableau dashboards for the regional sales team"))).toBe(true);
    expect(cv.experience.flatMap((job) => job.lines).every((line) => !line.tailored)).toBe(true);
  });

  it.each<TailoringStatus>(["proposed", "rejected"])("never includes a %s change", (status) => {
    const changes = [
      change(status),
      change(status, { section: "skills", before: null, after: "Git and GitHub" }),
      change(status, { section: "summary", before: profile.summary, after: "A summary the user never approved" }),
    ];
    const cv = buildTailoredCv(profile, changes);
    for (const item of changes) {
      expect(allText(cv)).not.toContain(item.after);
    }
    expect(buildTailoredCv(profile, changes)).toEqual(buildTailoredCv(profile, []));
  });

  it("replaces a line with its approved change and marks it as tailored", () => {
    const approved = change("approved");
    const lines = buildTailoredCv(profile, [approved]).experience[0].lines;
    expect(lines).toContainEqual({ text: approved.after, tailored: true });
    expect(lines.map((line) => line.text)).not.toContain(approved.before);
  });

  it("adds an approved tool to the technical skills, never to the six main skills", () => {
    const cv = buildTailoredCv(profile, [change("approved", { section: "skills", before: null, after: "Git and GitHub" })]);
    expect(cv.technicalSkills[0]).toEqual({ text: "Git and GitHub", tailored: true });
    expect(cv.skills).toEqual([]);
  });

  it("adds an approved main skill to the main skills and marks the CV line that shows it", () => {
    const line = "Built Tableau dashboards for the regional sales team";
    const cv = buildTailoredCv(profile, [change("approved", { gapId: undefined, section: "skills", before: null, after: "Communication", evidence: line, evidenceSource: "cv" })]);
    expect(cv.skills).toEqual([{ text: "Communication", tailored: true }]);
    expect(cv.experience.flatMap((job) => job.lines).find((item) => item.text === line)?.label).toBe("Communication:");
  });

  it("leaves a main skill the user has not approved off the CV", () => {
    const line = "Built Tableau dashboards for the regional sales team";
    const cv = buildTailoredCv(profile, [change("proposed", { gapId: undefined, section: "skills", before: null, after: "Communication", evidence: line, evidenceSource: "cv" })]);
    expect(cv.skills).toEqual([]);
    expect(cv.experience.flatMap((job) => job.lines).some((item) => item.label)).toBe(false);
  });

  it("keeps the approved change and drops a rejected one for the same line", () => {
    const approved = change("approved", { after: "Approved version" });
    const rejected = change("rejected", { after: "Rejected version" });
    const text = allText(buildTailoredCv(profile, [rejected, approved]));
    expect(text).toContain("Approved version");
    expect(text).not.toContain("Rejected version");
  });

  it("places a change whose line ends with a full stop or differs in quotes and spaces", () => {
    const approved = change("approved", { before: "Built Tableau dashboards for the regional sales team." });
    const cv = buildTailoredCv(profile, [approved]);
    expect(cv.experience[0].lines).toContainEqual({ text: approved.after, tailored: true });
    expect(cv.unplaced).toEqual([]);
  });

  it("places a change to an education line written the way the CV shows it", () => {
    const approved = change("approved", {
      section: "education",
      before: "MSc, Data Science, University of Manchester, Merit",
      after: "MSc, Data Science, University of Manchester, Merit (dissertation on churn prediction)",
    });
    const cv = buildTailoredCv(profile, [approved]);
    expect(cv.education[0]).toEqual({ text: approved.after, tailored: true });
    expect(cv.unplaced).toEqual([]);
  });

  it("never drops an approved change silently: one it cannot place is listed in unplaced", () => {
    const nowhere = change("approved", { section: "education", before: "MSc Data Science", after: "MSc Data Science (Merit)" });
    const first = change("approved", { after: "First version" });
    const second = { ...change("approved", { after: "Second version" }), id: "second" };
    const cv = buildTailoredCv(profile, [nowhere, first, second]);
    expect(allText(cv)).toContain("First version");
    expect(cv.unplaced.map((item) => item.after)).toEqual(["MSc Data Science (Merit)", "Second version"]);
  });

  it("knows which changes fit the CV", () => {
    expect(fitsCv(profile, { section: "experience", before: "Built Tableau dashboards for the regional sales team." })).toBe(true);
    expect(fitsCv(profile, { section: "skills", before: null })).toBe(true);
    expect(fitsCv(profile, { section: "education", before: "MSc Data Science" })).toBe(false);
    expect(fitsCv(profile, { section: "skills", before: "Built Tableau dashboards for the regional sales team" })).toBe(false);
  });

  it("writes CV dates in UK style", () => {
    expect(formatMonth("2024-06")).toBe("Jun 2024");
    expect(formatMonth(null)).toBe("Present");
  });
});

describe("the tailored CV for a job (#216)", () => {
  const job = {
    ...personas.sara.jobs[0],
    description: "We need excellent communicators. Our team uses Python.",
    requirements: { essential: ["Strong SQL", "Stakeholder management", "Teamwork"], desirable: ["Tableau", "Leadership"] },
  };
  const skills = ["Excel", "Negotiation", "Python", "SQL", "Tableau", "Teamwork", "Leadership", "Communication", "Stakeholder management", "Git"];
  const withSkills = { ...profile, skills };
  const shown = (cv: ReturnType<typeof buildTailoredCv>) => cv.skills.map((line) => line.text);

  it("shows at most six main skills, those the ad asks for first, the CV's others after, and never a tool", () => {
    const many = ["Python", "SQL", "Negotiation", "Creativity", "Mentoring", "Coaching", "Initiative", "Teamwork", "Leadership", "Communication", "Stakeholder management"];
    const cv = buildTailoredCv({ ...profile, skills: many }, [], job);
    expect(shown(cv)).toEqual(["Teamwork", "Stakeholder management", "Leadership", "Communication", "Negotiation", "Creativity"]);
    expect(cv.technicalSkills.map((line) => line.text)).toEqual(["SQL", "Python"]);
  });

  it("shows at most six even when the ad asks for more", () => {
    const names = ["Teamwork", "Leadership", "Communication", "Creativity", "Coaching", "Planning", "Mentoring"];
    const asking = { ...job, requirements: { essential: names, desirable: [] } };
    const cv = buildTailoredCv({ ...profile, skills: names }, [], asking);
    expect(shown(cv)).toEqual(names.slice(0, 6));
    expect(cv.overLimit).toEqual([]);
  });

  it("fills the row only from the CV, never with a skill it does not have", () => {
    expect(shown(buildTailoredCv({ ...profile, skills: ["Negotiation", "Excel"] }, [], job))).toEqual(["Negotiation"]);
  });

  it("counts Team management and Leader as main skills", () => {
    expect(shown(buildTailoredCv({ ...profile, skills: ["Team management", "Leader", "Excel"] }, [], job))).toEqual(["Team management", "Leader"]);
  });

  it("keeps a tool the ad asks for under Tools, not in the six", () => {
    const cv = buildTailoredCv({ ...profile, skills: ["Excel", "Word", "Python (pandas)"] }, [], job);
    expect(shown(cv)).toEqual([]);
    expect(cv.technicalSkills[0].text).toBe("Python (pandas)");
  });

  it("puts a skill the user approved for this job first", () => {
    const cv = buildTailoredCv(withSkills, [change("approved", { section: "skills", before: null, after: "Problem solving" })], job);
    expect(shown(cv)[0]).toBe("Problem solving");
  });

  it("reports an approved skill that did not fit in the six instead of losing it", () => {
    const approved = ["Adaptability", "Coaching", "Creativity", "Initiative", "Mentoring", "Planning", "Presentation"].map((after) =>
      change("approved", { id: after, section: "skills", before: null, after }),
    );
    const cv = buildTailoredCv(profile, approved, job);
    expect(cv.skills).toHaveLength(6);
    expect(cv.overLimit).toEqual(["Presentation"]);
    expect(cv.unplaced).toEqual([]);
  });

  it("lists a role's lines the job asks about first and keeps the roles in order", () => {
    const line = profile.experience[0].duties.at(-1)!;
    const asking = { ...job, requirements: { essential: [line], desirable: [] } };
    const cv = buildTailoredCv(profile, [], asking);
    expect(cv.experience[0].lines[0].text).toBe(line);
    expect(cv.experience.map((role) => role.company)).toEqual(profile.experience.map((role) => role.company));
  });

  it("labels certificates, driving licence and tools in the last section", () => {
    const cv = buildTailoredCv(
      { ...profile, skills: ["Excel", "Git"], certifications: [{ name: "PRINCE2 Foundation", year: 2023 }, { name: "Full UK driving licence" }] },
      [],
      job,
    );
    expect(otherLines(cv).map((line) => `${line.label} ${line.text}`)).toEqual(["Certificates: PRINCE2 Foundation (2023)", "Driving licence: Full UK", "Tools: Excel, Git"]);
  });

  it("shows the four tools the ad cares about most, not all of them", () => {
    const asked = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];
    const adTools = { ...job, description: "You will use Jira daily.", requirements: { essential: asked, desirable: [] } };
    const cv = buildTailoredCv({ ...profile, skills: ["Word", "Outlook", "Slack", "Zoom", "Jira", "Golf"] }, [], adTools);
    expect(cv.technicalSkills.map((line) => line.text)).toEqual(["Golf", "Jira", "Word", "Outlook"]);
  });

  it("shows the four certificates the ad cares about most, and keeps the licence apart", () => {
    const names = ["First Aid", "Food Hygiene", "IOSH Managing Safely", "Fire Marshal", "Scrum Master", "PRINCE2 Foundation"];
    const adCerts = { ...job, requirements: { essential: ["PRINCE2 certificate"], desirable: ["Certified Scrum Master"] } };
    const cv = buildTailoredCv({ ...profile, certifications: [...names.map((name) => ({ name })), { name: "Full UK driving licence" }] }, [], adCerts);
    expect(cv.certifications.map((line) => line.text)).toEqual(["Scrum Master", "PRINCE2 Foundation", "First Aid", "Food Hygiene"]);
    expect(cv.drivingLicences.map((line) => line.text)).toEqual(["Full UK"]);
  });

  it("reports an approved tool over the limit instead of losing it", () => {
    const approved = ["Jira", "Figma", "Slack", "Zoom", "Miro"].map((after) => change("approved", { id: after, section: "skills", before: null, after }));
    const cv = buildTailoredCv({ ...profile, skills: [] }, approved, job);
    expect(cv.technicalSkills).toHaveLength(4);
    expect(cv.overLimit).toEqual(["Miro"]);
  });

  it("finds a driving licence the CV listed among its skills", () => {
    const cv = buildTailoredCv({ ...profile, skills: ["Full UK driving licence"], certifications: [] }, [], job);
    expect(otherLines(cv).map((line) => `${line.label} ${line.text}`)).toEqual(["Driving licence: Full UK"]);
  });
});
