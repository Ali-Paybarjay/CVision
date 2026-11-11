import { describe, expect, it } from "vitest";
import { approveOnePerLine, buildTailoredCv, newLineRole, newLinePlace, roleForNewLine, fitsCv, formatMonth, otherLines } from "@/features/tailor/tailored-cv";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { cvLines } from "@/features/tailor/nothing-invented";
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

  it("adds an approved main skill to the main skills and leaves the CV line that shows it plain", () => {
    const line = "Built Tableau dashboards for the regional sales team";
    const cv = buildTailoredCv(profile, [change("approved", { gapId: undefined, section: "skills", before: null, after: "Communication", evidence: line, evidenceSource: "cv" })]);
    expect(cv.skills).toEqual([{ text: "Communication", tailored: true }]);
    expect(cv.experience.flatMap((job) => job.lines).find((item) => item.text === line)?.label).toBeUndefined();
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

  it("prints an education line as plain text, with no bold degree in front", () => {
    const cv = buildTailoredCv(profile, []);
    expect(cv.education.every((line) => line.label === undefined)).toBe(true);
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

  it("tells a change that lost its line to another apart from one whose line is not on the CV (#272)", () => {
    const nowhere = change("approved", { section: "education", before: "MSc Data Science", after: "MSc Data Science (Merit)" });
    const first = change("approved", { after: "First version" });
    const second = { ...change("approved", { after: "Second version" }), id: "second" };
    expect(buildTailoredCv(profile, [nowhere, first, second]).sameLine.map((item) => item.after)).toEqual(["Second version"]);
  });

  it("approving a second change to a line sends the first back to the suggestions (#272)", () => {
    const first = change("approved", { after: "First version" });
    const second = { ...change("proposed", { after: "Second version" }), id: "second" };
    const other = { ...change("approved", { section: "education", before: "MSc Data Science", after: "MSc (Merit)" }), id: "other" };
    const { changes, sentBack } = approveOnePerLine([first, second, other], { ...second, status: "approved" });

    expect(sentBack).toEqual([{ ...first, status: "proposed" }]);
    expect(changes.map((item) => [item.id, item.status])).toEqual([[first.id, "proposed"], ["second", "approved"], ["other", "approved"]]);
    const cv = buildTailoredCv(profile, changes);
    expect(allText(cv)).toContain("Second version");
    expect(cv.sameLine).toEqual([]);
  });

  it("treats two summaries as one line on a CV with no summary (#465)", () => {
    const noSummary = { ...profile, summary: "" };
    const first = { ...change("approved", { section: "summary", before: null, after: "First summary" }), id: "s1" };
    const second = { ...change("proposed", { section: "summary", before: null, after: "Second summary" }), id: "s2" };
    expect(approveOnePerLine([first, second], { ...second, status: "approved" }).sentBack).toEqual([{ ...first, status: "proposed" }]);
    const both = buildTailoredCv(noSummary, [first, { ...second, status: "approved" }]);
    expect(both.summary?.text).toBe("First summary");
    expect(both.sameLine.map((item) => item.id)).toEqual(["s2"]);
    expect(both.unplaced.map((item) => item.id)).toEqual(["s2"]);
  });

  it("sends nothing back for a rejection or a change that adds a new line", () => {
    const first = change("approved", { after: "First version" });
    expect(approveOnePerLine([first], { ...first, id: "x", status: "rejected" }).sentBack).toEqual([]);
    const added = change("approved", { section: "skills", before: null, after: "Git" });
    expect(approveOnePerLine([added], { ...added, id: "y" }).sentBack).toEqual([]);
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

  it("puts in only one of two skills that are almost the same, and does not call the other left out (#190)", () => {
    const asking = { ...job, requirements: { essential: ["Stakeholder communication"], desirable: [] } };
    const cv = buildTailoredCv({ ...profile, skills: ["Communication", "Stakeholder communication", "Team leadership", "Leadership"] }, [], asking);
    expect(shown(cv)).toEqual(["Stakeholder communication", "Team leadership"]);
    expect(cv.leftInProfile).toEqual([]);
  });

  it("keeps both of two almost-same skills when the user approved both", () => {
    const approved = ["Communication", "Stakeholder communication"].map((after) => change("approved", { id: after, section: "skills", before: null, after }));
    expect(shown(buildTailoredCv(profile, approved, job))).toEqual(["Communication", "Stakeholder communication"]);
  });

  it("names the Profile's skills and tools that did not fit, instead of leaving them off without a word (#190)", () => {
    const many = ["Negotiation", "Creativity", "Mentoring", "Coaching", "Initiative", "Teamwork", "Leadership", "Communication", "Stakeholder management"];
    const tools = ["SQL", "Python", "Excel", "Word", "Git", "Jira"];
    const cv = buildTailoredCv({ ...profile, skills: [...many, ...tools] }, [], job);
    const onCv = [...shown(cv), ...cv.technicalSkills.map((line) => line.text)];
    expect(cv.leftInProfile).toHaveLength(5);
    expect([...onCv, ...cv.leftInProfile].sort()).toEqual([...many, ...tools].sort());
    expect(cv.overLimit).toEqual([]);
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

describe("languages and projects on the tailored CV (#228)", () => {
  const full = {
    ...profile,
    languages: [{ name: "Welsh", level: "Fluent" }, { name: "Farsi" }],
    projects: [{ name: "Bus delay dashboard", organisation: "University of Manchester", startDate: "2024-01", endDate: "2024-06", details: ["Built a dashboard of bus delays"] }],
    volunteering: [{ role: "Volunteer tutor", details: ["Taught maths to adults every week"] }],
  };

  it("shows them as the Profile has them, invents no level, and leaves volunteering off the CV", () => {
    const cv = buildTailoredCv(full, []);
    expect(cv.languages.map((line) => line.text)).toEqual(["Welsh (Fluent)", "Farsi"]);
    expect(cv.projects).toEqual([{ title: "Bus delay dashboard", company: "University of Manchester", dates: "Jan 2024 – Jun 2024", lines: [{ text: "Built a dashboard of bus delays", tailored: false }] }]);
    expect(JSON.stringify(cv)).not.toContain("Volunteer tutor");
  });

  it("lists languages in the last section, right under the certificates", () => {
    const cv = buildTailoredCv({ ...full, skills: ["Excel"], certifications: [{ name: "PRINCE2 Foundation", year: 2023 }, { name: "Full UK driving licence" }] }, []);
    expect(otherLines(cv).map((line) => `${line.label} ${line.text}`)).toEqual([
      "Certificates: PRINCE2 Foundation (2023)",
      "Languages: Welsh (Fluent), Farsi",
      "Driving licence: Full UK",
      "Tools: Excel",
    ]);
  });

  it("leaves them empty for a Profile without them", () => {
    const cv = buildTailoredCv(profile, []);
    expect([cv.languages, cv.projects]).toEqual([[], []]);
  });

  it("counts languages and projects as evidence for Nothing invented", () => {
    const lines = cvLines(full);
    for (const line of ["Welsh", "Fluent", "Bus delay dashboard", "Built a dashboard of bus delays"]) expect(lines).toContain(line);
  });
});

describe("a new work line goes under the role it names (#446)", () => {
  const newLine = (evidence: string, who = profile) => ({ ...change("approved", { section: "experience", before: null, after: "Trained new starters on the tills", evidence }) , who });
  const roleOf = (evidence: string, who = profile) => who.experience[roleForNewLine(who, { evidence })];

  it("puts Sara's Greenway line under Greenway Foods, on the CV and on its card", () => {
    const { who, ...line } = newLine("I trained new starters on the tills at Greenway Foods.");
    const cv = buildTailoredCv(who, [line]);
    expect(cv.experience[1].lines).toContainEqual({ text: line.after, tailored: true });
    expect(cv.experience[0].lines.map((item) => item.text)).not.toContain(line.after);
    expect(newLineRole(who, line)).toEqual({ role: "Customer Assistant (part-time), Greenway Foods", named: true });
  });

  it("puts a line that names no role under the most recent one", () => {
    expect(roleOf("I trained new starters.").company).toBe("Northgate Retail Insights");
  });

  it("tells two roles at one company apart by the longest title named", () => {
    expect(roleOf("Deputy Store Manager at Hartley's Home Stores", personas.daniel.profile).title).toBe("Deputy Store Manager");
  });

  it("goes by the company first", () => {
    expect(roleOf("Maths Teacher at Riverside Academy", personas.reza.profile).company).toBe("Riverside Academy");
  });

  it("finds only whole words, so EE is not found in engineering", () => {
    const withEe = { ...profile, experience: [...profile.experience, { ...profile.experience[1], title: "Sales Adviser", company: "EE" }] };
    expect(roleOf("I did some engineering work.", withEe).company).toBe("Northgate Retail Insights");
    expect(roleOf("I sold contracts at EE.", withEe).company).toBe("EE");
  });

  it("gives no role for a change that is not a new work line", () => {
    expect(newLineRole(profile, change("approved"))).toBeUndefined();
  });
});

describe("a new work line goes under the role the answer means, even by a short name (#467)", () => {
  const sara = personas.sara.profile;
  const daniel = personas.daniel.profile;
  const reza = personas.reza.profile;
  const place = (who: typeof sara, evidence: string) => newLinePlace(who, { evidence });
  const titleOf = (who: typeof sara, evidence: string) => who.experience[place(who, evidence).index].title;
  const withRoles = (...roles: [string, string][]) => ({
    ...sara,
    experience: roles.map(([title, company]) => ({ ...sara.experience[0], title, company })),
  });

  it("finds Reza's newer role whose title holds the one he named", () => {
    expect(place(reza, "As a maths teacher I ran revision classes.").index).toBe(0);
  });

  it("does not take a title found only inside a longer one, and takes the newest of several", () => {
    expect(titleOf(daniel, "As store manager I coached my deputy store manager.")).toBe("Store Manager");
    const acme = withRoles(["Senior Data Analyst", "Acme"], ["Data Analyst", "Acme"]);
    expect(titleOf(acme, "As a data analyst at Acme I built reports.")).toBe("Senior Data Analyst");
  });

  it("reads a company of one word only with a capital and not at the start of a sentence", () => {
    for (const company of ["Next", "Three", "Very"]) {
      const who = withRoles(["Data Analyst", "Northgate"], ["Sales Assistant", company]);
      expect(place(who, `At ${company} I trained three new starters.`)).toEqual({ index: 1, named: true });
      for (const evidence of ["I trained new starters the next day.", "Three new starters joined.", "I worked there for three years.", "I was very careful with stock.", `${company}, I trained new starters.`]) {
        expect(place(who, evidence), evidence).toEqual({ index: 0, named: false });
      }
    }
  });

  it("finds a role by the first word of its company, by its title without brackets, and without apostrophes", () => {
    expect(place(sara, "At Greenway I trained new starters.")).toEqual({ index: 1, named: true });
    expect(place(sara, "As a customer assistant I trained new starters.")).toEqual({ index: 1, named: true });
    const tesco = withRoles(["Data Analyst", "Northgate"], ["Sales Assistant", "Tesco Stores Ltd"], ["Shop Assistant", "Sainsbury's"]);
    expect(place(tesco, "At Tesco I trained new starters.").index).toBe(1);
    expect(place(tesco, "At Sainsburys I trained new starters.").index).toBe(2);
  });

  it("says when the answer names no role on the CV", () => {
    const line = { ...change("approved", { section: "experience", before: null, after: "Trained new starters", evidence: "At my weekend job at Tesco I trained new starters." }) };
    expect(newLineRole(sara, line)).toEqual({ role: "Data Analyst Intern, Northgate Retail Insights", named: false });
  });
});

describe("Management next to Time and Project management (#467)", () => {
  const job = {
    ...personas.sara.jobs[0],
    requirements: { essential: ["Management", "Time management", "Project management"], desirable: [] },
  };
  const shown = (cv: ReturnType<typeof buildTailoredCv>) => cv.skills.map((line) => line.text);

  it("keeps Management beside Time management and Project management", () => {
    expect(shown(buildTailoredCv({ ...profile, skills: ["Management", "Time management", "Project management"] }, [], job))).toEqual([
      "Management",
      "Time management",
      "Project management",
    ]);
  });

  it("still keeps an approved Management beside them", () => {
    const approved = change("approved", { id: "m", section: "skills", before: null, after: "Management" });
    expect(shown(buildTailoredCv({ ...profile, skills: ["Time management", "Project management"] }, [approved], job))).toEqual([
      "Management",
      "Time management",
      "Project management",
    ]);
  });

  it("still puts in only one of People management and Management", () => {
    expect(shown(buildTailoredCv({ ...profile, skills: ["Management", "People management"] }, [], job))).toHaveLength(1);
  });
});
