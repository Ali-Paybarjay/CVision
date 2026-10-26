import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { findBrandProblems } from "@/features/tailor/brand-check";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import {
  buildLinkedInSuggestions,
  checkWriting,
  LinkedInAnswerSchema,
  linkedInRoles,
  linkedInTitle,
  MAX_LINES_PER_ROLE,
  requirementFindings,
  suggestByRules,
  type LinkedInAnswer,
} from "./linkedin";
import { assessByRules, buildMatchResult, profileEvidenceLines } from "./match";

const names = Object.keys(personas) as PersonaName[];
const cases = names.flatMap((name) => personas[name].jobs.map((job, index) => ({ name, number: index + 1, job })));

/** The persona's written match for their first job; the second is matched by the demo's rules, as in my-data.ts. */
function matchFor(name: PersonaName, job: Job, profile: Profile = personas[name].profile): MatchResult {
  const { match } = personas[name];
  return match.jobId === job.id ? match : buildMatchResult(job, profile, assessByRules(profile, job)).match;
}

/** The id match.ts gives a profile line, found by its words. */
function idOf(profile: Profile, text: string): string {
  const line = profileEvidenceLines(profile).find((item) => item.text === text);
  if (!line) throw new Error(`No profile line reads "${text}"`);
  return line.id;
}

type RoleAnswer = LinkedInAnswer["roles"][number];
function role(roleId: string, lines: [string, string[]][], skills: string[] = []): RoleAnswer {
  return { role: roleId, lines: lines.map(([text, from]) => ({ text, from })), skills };
}
function build(roles: RoleAnswer[], name: PersonaName = "sara", job: Job = personas[name].jobs[0], profile = personas[name].profile) {
  return buildLinkedInSuggestions(profile, job, matchFor(name, job, profile), { roles });
}

/** One written line for one role, citing profile lines by their words, checked against the persona's first job. */
function write(name: PersonaName, roleId: string, text: string, sources: string[], profile = personas[name].profile) {
  const from = sources.map((source) => idOf(profile, source));
  return build([role(roleId, [[text, from]])], name, personas[name].jobs[0], profile);
}

const sara = personas.sara;
const clean = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
const dashboards = "Built Tableau dashboards for the regional sales team";
const report = "Automated a weekly stock report, cutting preparation time from 4 hours to 30 minutes";
const served = "Served customers on the tills and the shop floor";
const trained = "Trained four new starters";
const saraAnswer = sara.profile.followUpAnswers[0].answer;
const id = (text: string) => idOf(sara.profile, text);

const emma = {
  build: "Build and maintain React and TypeScript websites for six agency clients",
  review: "Review pull requests with two senior developers",
  booking: "Rebuilt a client's booking form, reducing abandoned bookings by 18%",
};
const reza = {
  taught: "Taught maths to classes of 30 across Key Stages 3 and 4",
  tutors: "Led a team of nine form tutors for a year group of 210 students",
  timetable: "Coordinated the move to a new school timetable for 1,100 students and 80 staff, delivered on time",
  budget: "Managed the year group's £15,000 trips and activities budget",
  years: "Taught maths to Years 7 to 11",
  club: "Organised the school's maths challenge club",
};
const daniel = {
  store: "Run a store with 45 staff and a turnover of £9 million a year",
  pnl: "Own the store's profit and loss, wage budget and stock levels",
  kpis: "Report weekly sales, waste and availability KPIs to the area manager",
  loss: "Cut stock loss from 2.1% to 1.3% of sales in two years",
  award: "Store of the Year for the Midlands region, 2023",
  covered: "Covered the store manager's role during absences",
  food: "Supervised the fresh food department and its team of eight",
};

describe("linkedInRoles", () => {
  it("puts each role's duties and results under it, with the same ids as the match", () => {
    const { roles, shared } = linkedInRoles(sara.profile);

    expect(roles.map((item) => [item.id, item.role.text, item.lines.map((line) => line.text)])).toEqual([
      ["R1", "Data Analyst Intern at Northgate Retail Insights", [clean, dashboards, report]],
      ["R2", "Customer Assistant (part-time) at Greenway Foods", [served, trained]],
    ]);
    expect(roles[0].lines[0].id).toBe(id(clean));
    expect(new Set(shared.map((line) => line.kind))).toEqual(new Set(["summary", "skill", "education", "answer"]));
  });
});

describe("linkedInTitle", () => {
  it("moves a note such as (part-time) to LinkedIn's Employment type, and keeps any other title as it is", () => {
    expect(linkedInTitle("Customer Assistant (part-time)")).toEqual({ title: "Customer Assistant", employmentType: "Part-time" });
    expect(linkedInTitle("Software Engineer (Contract)")).toEqual({ title: "Software Engineer", employmentType: "Contract" });
    expect(linkedInTitle("Teacher (maternity cover)")).toEqual({ title: "Teacher (maternity cover)", employmentType: null });
    expect(linkedInTitle("Maths Teacher and Head of Year 9")).toEqual({ title: "Maths Teacher and Head of Year 9", employmentType: null });
  });

  it("reads an internship or apprenticeship only from the title's last word", () => {
    expect(linkedInTitle("Data Analyst Intern").employmentType).toBe("Internship");
    expect(linkedInTitle("Software Apprentice").employmentType).toBe("Apprenticeship");
    for (const title of ["Internship Coordinator", "Head of Intern Programmes", "Apprenticeship Programme Manager", "Apprentice Assessor"]) {
      expect(linkedInTitle(title).employmentType, title).toBeNull();
    }
  });
});

describe("buildLinkedInSuggestions", () => {
  it("keeps a line reworded from its own lines, and shows the lines it rests on", () => {
    const tightened = "Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes";

    const { suggestions, rejected } = build([role("R1", [[tightened, [id(report)]]])]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines).toEqual([{ text: tightened, sources: [{ kind: "achievement", text: report }], reworded: true }]);
  });

  it("marks a line in the CV's own words as not reworded, and understands ids written loosely", () => {
    const { suggestions } = build([role("R1", [[dashboards, [` ${id(dashboards).toLowerCase()} `]]])]);

    expect(suggestions.roles[0].lines).toEqual([{ text: dashboards, sources: [{ kind: "duty", text: dashboards }], reworded: false }]);
  });

  it("takes an answer as evidence for the role it is about, and says it is an answer", () => {
    const line = "Walked the regional managers through the dashboard every Monday and wrote a one-page summary in plain English";

    const { suggestions, rejected } = write("sara", "R1", line, [saraAnswer]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines[0].sources).toEqual([{ kind: "answer", text: saraAnswer }]);
  });

  it.each([
    ["no line at all", [], /rests on no duty or result/],
    ["a line that isn't on the profile", ["L999"], /L999 is not a line of the profile/],
    ["another role's line", [trained], /belongs to another role/],
    ["only a skill and the summary", ["SQL", "L1"], /rests on no duty or result/],
    ["an answer about another role", [saraAnswer], /rests on no duty or result/],
  ])("drops a line that rests on %s", (_, sources, reason) => {
    const roleId = sources[0] === saraAnswer ? "R2" : "R1";
    const from = sources.map((source) => (/^L\d+$/.test(source) ? source : id(source)));

    const { suggestions, rejected } = build([role(roleId, [[roleId === "R2" ? "Walked the regional managers through the dashboard" : dashboards, from]])]);

    expect(suggestions.roles).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(reason);
  });

  // Each of these was kept by an earlier version of the checks: none of them may reach the user (Nothing invented).
  it.each([
    ["a rank", "sara", "R1", "Led the regional sales team", [dashboards]],
    ["a wider scope", "sara", "R1", "Built Tableau dashboards for the international sales team", [dashboards]],
    ["a tool at the start", "sara", "R1", "Looker dashboards built for the regional sales team", [dashboards]],
    ["a tool that starts like a word of the line", "sara", "R1", "Salesforce dashboards built for the regional sales team", [dashboards]],
    ["a short tool name", "sara", "R1", "Cleaned and joined weekly sales data from 120 stores using SQL, dbt and Python", [clean]],
    ["more than the figure", "sara", "R1", "Cleaned and joined weekly sales data from more than 120 stores using SQL and Python", [clean]],
    ["running the shop", "sara", "R2", "Ran the shop", [served]],
    ["a manager's title", "sara", "R2", "Trained four new starters as shop floor manager", [trained, served]],
    ["leading senior colleagues", "emma", "R1", "Led two senior developers in reviewing pull requests", [emma.review]],
    ["a senior title", "emma", "R1", "Senior developer: build and maintain React and TypeScript websites for six agency clients and review pull requests", [emma.build, emma.review]],
    ["a result", "emma", "R1", "Rebuilt a client's booking form, doubling bookings and reducing abandoned bookings by 18%", [emma.booking]],
    ["founding", "reza", "R2", "Founded the school's maths challenge club", [reza.club]],
    ["setting up", "reza", "R2", "Set up and ran the school's maths challenge club", [reza.club]],
    ["growth", "daniel", "R1", "Grew a store with 45 staff to a turnover of £9 million a year", [daniel.store]],
    ["a method the CV doesn't name", "daniel", "R1", "Cut stock loss from 2.1% to 1.3% of sales in two years through kaizen", [daniel.loss]],
    ["a skill the match found missing", "emma", "R1", "Build and maintain tested React and TypeScript websites for six agency clients", [emma.build]],
    ["a tool the match found missing, run together", "sara", "R1", "PowerBI dashboards built for the regional sales team", [dashboards]],
    ["a verb borrowed from another line, for leading", "reza", "R1", "Led the move to a new school timetable for 1,100 students and 80 staff", [reza.tutors, reza.timetable]],
    ["a verb borrowed from another line, for managing", "reza", "R1", "Managed a team of nine form tutors for a year group of 210 students", [reza.tutors, reza.budget]],
    ["a verb borrowed from another line, for automating", "sara", "R1", "Automated Tableau dashboards for the regional sales team", [dashboards, report]],
  ] as const)("drops a line that adds %s", (_, name, roleId, text, sources) => {
    const { suggestions, rejected } = write(name, roleId, text, [...sources]);

    expect(suggestions.roles).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it.each([
    ["the summary", "sara", "R2", "Cleaned and analysed retail sales data in Python and SQL", [served, "Data science graduate with hands-on experience cleaning and analysing retail sales data in Python and SQL."]],
    ["a skill", "sara", "R2", "Served customers on the tills and the shop floor using SQL", [served, "SQL"]],
    ["a certificate from later on", "daniel", "R3", "Supervised the fresh food department and its team of eight with IOSH Managing Safely", [daniel.food, "IOSH Managing Safely, IOSH, 2020"]],
  ] as const)("never takes words for a role's line from %s", (_, name, roleId, text, sources) => {
    const { suggestions, rejected } = write(name, roleId, text, [...sources]);

    expect(suggestions.roles).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it.each([
    ["counting something else", "daniel", "R1", "Ran 9 stores with 45 staff each and a turnover of £45 million a year", [daniel.store]],
    ["swapping what two figures count", "reza", "R1", "Coordinated the move to a new school timetable for 80 schools and 1,100 staff, delivered on time", [reza.timetable]],
    ["turning class size into a number of classes", "reza", "R1", "Taught maths to 30 classes across Key Stages 3 and 4", [reza.taught]],
    ["taking a percentage as a count", "emma", "R1", "Build and maintain React and TypeScript websites for 18 agency clients", [emma.build, emma.booking]],
    ["turning a change into a cut", "daniel", "R1", "Cut stock loss by 2.1% of sales in two years", [daniel.loss]],
  ] as const)("drops a figure %s", (_, name, roleId, text, sources) => {
    const { rejected } = write(name, roleId, text, [...sources]);

    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(/which its lines don't say that way|which its lines don't\./)]);
  });

  it("never takes a missing skill from an answer that says the opposite", () => {
    const profile: Profile = {
      ...sara.profile,
      followUpAnswers: [
        ...sara.profile.followUpAnswers,
        { id: "a2", question: "Have you used Power BI?", answer: "I have never used Power BI; all my dashboards were in Tableau.", answeredAt: "2026-10-21T09:00:00.000Z" },
      ],
    };

    const { suggestions, rejected } = write(
      "sara",
      "R1",
      "Built Tableau and Power BI dashboards for the regional sales team",
      [dashboards, "I have never used Power BI; all my dashboards were in Tableau."],
      profile,
    );

    expect(suggestions.roles).toEqual([]);
    expect(rejected[0].reason).toMatch(/your CV doesn't show for this role/);
  });

  it.each([
    ["a later clause brought to the front", "sara", "R1", "Cut preparation time from 4 hours to 30 minutes by automating a weekly stock report", [report]],
    ["the second of two verbs", "sara", "R1", "Joined weekly sales data from 120 stores using SQL and Python", [clean]],
    ["£15k for £15,000", "reza", "R1", "Managed the year group's £15k trips and activities budget", [reza.budget]],
    ["the present tense of an irregular verb", "reza", "R1", "Lead a team of nine form tutors for a year group of 210 students", [reza.tutors]],
    ["another irregular verb", "reza", "R2", "Teach maths to Years 7 to 11", [reza.years]],
    ["P&L for profit and loss", "daniel", "R1", "Own the store's P&L, wage budget and stock levels", [daniel.pnl]],
    ["a rank as the line uses it", "daniel", "R1", "Reported weekly sales, waste and availability KPIs to the area manager", [daniel.kpis]],
    ["a role covered, in fewer words", "daniel", "R2", "Covered for the store manager during absences", [daniel.covered]],
    ["senior colleagues, still colleagues", "emma", "R1", "Reviewed pull requests with two senior developers", [emma.review]],
    ["a figure in digits", "sara", "R2", "Trained 4 new starters", [trained]],
    ["a year", "daniel", "R1", "Store of the Year for the Midlands region in 2023", [daniel.award]],
    ["two lines of the same role", "daniel", "R1", "Run a store with 45 staff and a turnover of £9 million a year, and own its profit and loss", [daniel.store, daniel.pnl]],
  ] as const)("keeps an honest line with %s", (_, name, roleId, text, sources) => {
    const { suggestions, rejected } = write(name, roleId, text, [...sources]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines.map((line) => line.text)).toEqual([text]);
  });

  it("keeps the skills the role's own lines show, by id or by name, and drops the rest", () => {
    const { suggestions, rejected } = build([
      role("R1", [[dashboards, [id(dashboards)]]], [id("SQL"), "tableau", id("Excel"), "Power BI", id(clean)]),
    ]);

    expect(suggestions.roles[0].skills).toEqual(["SQL", "Tableau"]);
    expect(rejected.map((item) => [item.text, item.reason])).toEqual([
      ["Excel", "The role's own lines don't show this skill."],
      ["Power BI", "It is not a skill on the profile."],
      [id(clean), "It is not a skill on the profile."],
    ]);
  });

  it("shows P&L management for the role that owns the profit and loss, and only there", () => {
    const pnl = idOf(personas.daniel.profile, "P&L management");

    const { suggestions } = build(
      [role("R1", [[daniel.pnl, [idOf(personas.daniel.profile, daniel.pnl)]]], [pnl]), role("R2", [[daniel.covered, [idOf(personas.daniel.profile, daniel.covered)]]], [pnl])],
      "daniel",
    );

    expect(suggestions.roles.map((item) => item.skills)).toEqual([["P&L management"], []]);
  });

  it("counts only what the profile doesn't back up: not an empty line, nor a second answer for a role", () => {
    const { suggestions, rejected } = build([
      role("R1", [[dashboards, [id(dashboards)]], ["  ", []]]),
      role("R1", [[clean, [id(clean)]]]),
      role("R9", [["Ran the shop", [id(served)]]]),
    ]);

    expect(suggestions.roles.map((item) => item.lines.map((line) => line.text))).toEqual([[dashboards]]);
    expect(rejected).toEqual([{ role: "R9", text: "Ran the shop", reason: "There is no role R9 on the profile." }]);
    expect(suggestions.dropped).toBe(1);
  });

  it(`keeps at most ${MAX_LINES_PER_ROLE} lines for a role, without repeats, and removes hidden characters`, () => {
    const lines: [string, string[]][] = [
      [`Built​ Tableau dashboards for the regional sales team`, [id(dashboards)]],
      [`${dashboards}.`, [id(dashboards)]],
      [clean, [id(clean)]],
      ["Cleaned and joined weekly sales data from 120 stores in SQL and Python", [id(clean)]],
      [report, [id(report)]],
      ["Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes", [id(report)]],
      ["Cleaned and joined sales data from 120 stores using SQL and Python", [id(clean)]],
    ];

    const { suggestions, rejected } = build([role("R1", lines)]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines.map((line) => line.text)).toEqual([
      dashboards,
      clean,
      "Cleaned and joined weekly sales data from 120 stores in SQL and Python",
      report,
      "Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes",
    ]);
  });

  it("takes LinkedIn's other fields from the CV, never from the model", () => {
    const { suggestions } = build([role("R2", [[trained, [id(trained)]]])]);

    expect(suggestions.roles[0]).toMatchObject({
      id: "R2",
      title: "Customer Assistant",
      cvTitle: "Customer Assistant (part-time)",
      employmentType: "Part-time",
      company: "Greenway Foods",
      location: "Leeds",
      period: "Jan 2022 to Jun 2024",
      sameCompanyAs: null,
    });
    expect(suggestions.otherRoles).toEqual(["Data Analyst Intern at Northgate Retail Insights"]);
  });

  it("says when a role is at the same company as an earlier one, as LinkedIn lists both under it", () => {
    const { suggestions } = write("daniel", "R2", daniel.covered, [daniel.covered]);

    expect(suggestions.roles[0]).toMatchObject({ title: "Deputy Store Manager", sameCompanyAs: "Store Manager" });
  });

  it("lists what the ad asks for that the CV doesn't show clearly, in the ad's order, the uncovered ones included", () => {
    const { suggestions } = build([]);

    expect(suggestions.notShown).toEqual([
      { requirement: "Clear communication with non-technical stakeholders", importance: "essential", kind: "unclear" },
      { requirement: "Power BI", importance: "desirable", kind: "missing" },
      { requirement: "Healthcare or NHS data", importance: "desirable", kind: "missing" },
      { requirement: "Git", importance: "desirable", kind: "missing" },
    ]);
    expect(suggestions.roles).toEqual([]);
    expect(suggestions.otherRoles).toHaveLength(2);
  });
});

describe("requirementFindings", () => {
  it("reads met, unclear and missing from the match, and nothing without one", () => {
    const findings = requirementFindings(sara.match);

    expect(findings.get("Strong SQL")).toBe("met");
    expect(findings.get("Clear communication with non-technical stakeholders")).toBe("unclear");
    expect(findings.get("Healthcare or NHS data")).toBe("missing");
    expect(requirementFindings(null).size).toBe(0);
  });
});

describe("checkWriting", () => {
  it("reads figures written as words, with commas or with a scale", () => {
    expect(checkWriting("Trained 4 new starters", { evidence: [trained] })).toBeNull();
    expect(checkWriting("Trained four new starters", { evidence: ["Trained 4 new starters"] })).toBeNull();
    expect(checkWriting("Run a store with a turnover of £9m", { evidence: [daniel.store] })).toBeNull();
    expect(checkWriting("Run a store with a turnover of £9bn", { evidence: [daniel.store] })).toMatch(/"£9bn"/);
    expect(checkWriting("Coordinated the move to a new timetable for 1,100 students", { evidence: [reza.timetable] })).toBeNull();
    expect(checkWriting("Served hundreds of customers on the tills", { evidence: [served] })).toMatch(/"hundreds"/);
    expect(checkWriting("Cleaned weekly sales data from 120+ stores", { evidence: [clean] })).toMatch(/"120\+"/);
  });

  it("keeps the main verb where the lines have it: helping to manage is not managing", () => {
    const helped = "Helped manage the weekly stock count";

    expect(checkWriting("Managed the weekly stock count", { evidence: [helped] })).toMatch(/starts with "Managed"/);
    expect(checkWriting("Helped manage the weekly stock count", { evidence: [helped] })).toBeNull();
  });

  it("refuses a line too long for LinkedIn", () => {
    expect(checkWriting(`${dashboards} `.repeat(6), { evidence: [dashboards] })).toMatch(/too long/);
  });
});

describe("suggestByRules, the mock answer", () => {
  it.each(cases)("$name, job $number: only each role's own lines, word for word, and all of them kept", ({ name, job }) => {
    const { profile } = personas[name];

    const sample = suggestByRules(profile, job);
    const { suggestions, rejected } = buildLinkedInSuggestions(profile, job, matchFor(name, job), LinkedInAnswerSchema.parse(sample));

    expect(rejected).toEqual([]);
    expect(suggestions.roles.length).toBeGreaterThan(0);
    const { roles } = linkedInRoles(profile);
    for (const suggested of suggestions.roles) {
      const own = roles.find((item) => item.id === suggested.id)?.lines.map((line) => line.text) ?? [];
      expect(suggested.lines.length).toBeGreaterThan(0);
      expect(suggested.lines.length).toBeLessThanOrEqual(MAX_LINES_PER_ROLE);
      for (const line of suggested.lines) {
        expect(own).toContain(line.text);
        expect(line.reworded).toBe(false);
      }
      for (const skill of suggested.skills) expect(profile.skills).toContain(skill);
      expect(findBrandProblems(suggested.lines.map((line) => line.text).join("\n"))).toEqual([]);
    }
  });

  it("leaves out a role none of whose lines names the ad's requirements", () => {
    const { suggestions } = buildLinkedInSuggestions(sara.profile, sara.jobs[0], sara.match, suggestByRules(sara.profile, sara.jobs[0]));

    expect(suggestions.roles.map((item) => item.title)).toEqual(["Data Analyst Intern"]);
    expect(suggestions.otherRoles).toEqual(["Customer Assistant (part-time) at Greenway Foods"]);
    expect(suggestions.roles[0].lines.map((line) => line.text)).toEqual([clean, dashboards]);
  });

  it("gives a role only the skills its own lines name", () => {
    const { profile, jobs, match } = personas.daniel;

    const { suggestions } = buildLinkedInSuggestions(profile, jobs[0], match, suggestByRules(profile, jobs[0]));

    expect(suggestions.roles.map((item) => [item.title, item.skills])).toEqual([
      ["Store Manager", ["P&L management", "KPI reporting", "Stock control"]],
      ["Deputy Store Manager", ["Team leadership"]],
      ["Department Supervisor", ["Team leadership"]],
    ]);
  });
});

describe("the model's answer format", () => {
  it("converts to a structured output format", () => {
    expect(() => zodOutputFormat(LinkedInAnswerSchema)).not.toThrow();
  });
});
