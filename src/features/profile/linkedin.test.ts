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
function matchFor(name: PersonaName, job: Job): MatchResult {
  const { profile, match } = personas[name];
  return match.jobId === job.id ? match : buildMatchResult(job, profile, assessByRules(profile, job)).match;
}

/** The id match.ts gives a profile line, found by its words. */
function idOf(profile: Profile, text: string): string {
  const line = profileEvidenceLines(profile).find((item) => item.text === text);
  if (!line) throw new Error(`No profile line reads "${text}"`);
  return line.id;
}

const sara = personas.sara;
const saraJob = sara.jobs[0];
const clean = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
const dashboards = "Built Tableau dashboards for the regional sales team";
const report = "Automated a weekly stock report, cutting preparation time from 4 hours to 30 minutes";
const trained = "Trained four new starters";
const id = (text: string) => idOf(sara.profile, text);

type RoleAnswer = LinkedInAnswer["roles"][number];
function role(roleId: string, lines: [string, string[]][], skills: string[] = [], intro = ""): RoleAnswer {
  return { role: roleId, intro, lines: lines.map(([text, from]) => ({ text, from })), skills };
}
function build(roles: RoleAnswer[], name: PersonaName = "sara", job: Job = saraJob) {
  return buildLinkedInSuggestions(personas[name].profile, job, matchFor(name, job), { roles });
}

describe("linkedInRoles", () => {
  it("puts each role's duties and results under it, with the same ids as the match", () => {
    const { roles, shared } = linkedInRoles(sara.profile);

    expect(roles.map((item) => [item.id, item.role.text, item.lines.map((line) => line.text)])).toEqual([
      ["R1", "Data Analyst Intern at Northgate Retail Insights", [clean, dashboards, report]],
      ["R2", "Customer Assistant (part-time) at Greenway Foods", ["Served customers on the tills and the shop floor", trained]],
    ]);
    expect(roles[0].lines[0].id).toBe(id(clean));
    expect(new Set(shared.map((line) => line.kind))).toEqual(new Set(["summary", "skill", "education", "answer"]));
  });
});

describe("linkedInTitle", () => {
  it("moves a note such as (part-time) to LinkedIn's Employment type, and keeps any other title as it is", () => {
    expect(linkedInTitle("Customer Assistant (part-time)")).toEqual({ title: "Customer Assistant", employmentType: "Part-time" });
    expect(linkedInTitle("Software Engineer (Contract)")).toEqual({ title: "Software Engineer", employmentType: "Contract" });
    expect(linkedInTitle("Data Analyst Intern")).toEqual({ title: "Data Analyst Intern", employmentType: "Internship" });
    expect(linkedInTitle("Teacher (maternity cover)")).toEqual({ title: "Teacher (maternity cover)", employmentType: null });
    expect(linkedInTitle("Maths Teacher and Head of Year 9")).toEqual({ title: "Maths Teacher and Head of Year 9", employmentType: null });
  });
});

describe("buildLinkedInSuggestions", () => {
  it("keeps a line reworded from its own lines, and shows the lines it rests on", () => {
    const tightened = "Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes";

    const { suggestions, rejected } = build([role("R1", [[tightened, [id(report)]]])]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines).toEqual([
      { text: tightened, sources: [{ kind: "achievement", text: report }], reworded: true },
    ]);
  });

  it("marks a line in the CV's own words as not reworded, and understands ids written loosely", () => {
    const { suggestions } = build([role("R1", [[dashboards, [` ${id(dashboards).toLowerCase()} `]]])]);

    expect(suggestions.roles[0].lines).toEqual([{ text: dashboards, sources: [{ kind: "duty", text: dashboards }], reworded: false }]);
  });

  it("takes an answer as evidence, and says it is an answer", () => {
    const answer = sara.profile.followUpAnswers[0].answer;
    const line = "Walked the regional managers through the dashboard every Monday and wrote a one-page summary in plain English";

    const { suggestions, rejected } = build([role("R1", [[line, [id(answer)]]])]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines[0].sources).toEqual([{ kind: "answer", text: answer }]);
  });

  it.each([
    ["no line at all", [], /points at no line/],
    ["a line that isn't on the profile", ["L999"], /L999 is not a line of the profile/],
    ["another role's line", ["TRAINED"], /belongs to another role/],
    ["only a skill and the summary", ["SQL", "SUMMARY"], /None of its lines is a duty or result/],
  ])("drops a line that rests on %s", (_, from, reason) => {
    const ids = from.map((item) =>
      item === "TRAINED" ? id(trained) : item === "SQL" ? id("SQL") : item === "SUMMARY" ? "L1" : item,
    );

    const { suggestions, rejected } = build([role("R1", [[dashboards, ids]])]);

    expect(suggestions.roles).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(reason);
  });

  it.each([
    ["a figure", "Cleaned and joined weekly sales data from 150 stores using SQL and Python", clean, /"150"/],
    ["a tool", "Built Tableau and Power BI dashboards for the regional sales team", dashboards, /"Power"/],
    ["a word from the ad", "Built Tableau dashboards for the regional healthcare team", dashboards, /"Healthcare"/],
    ["a skill from another part of the CV", "Built Tableau dashboards and statistics for the regional sales team", dashboards, /"Statistics"/],
    ["mostly new words", "Delivered insight presentations to senior leadership across multiple business units", dashboards, /Most of its words/],
  ])("drops a line that adds %s its lines don't give", (_, text, source, reason) => {
    const { suggestions, rejected } = build([role("R1", [[text, [id(source)]]])]);

    expect(suggestions.roles).toEqual([]);
    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(reason)]);
    expect(suggestions.dropped).toBe(1);
  });

  it("keeps an intro the role's own lines back up, and drops one that claims more", () => {
    const good = "Data analyst intern working with weekly sales data from 120 stores.";
    const bad = "Data analyst intern for an NHS trust, analysing patient data.";

    expect(build([role("R1", [[dashboards, [id(dashboards)]]], [], good)]).suggestions.roles[0].intro).toBe(good);
    const { suggestions, rejected } = build([role("R1", [[dashboards, [id(dashboards)]]], [], bad)]);
    expect(suggestions.roles[0].intro).toBe("");
    expect(rejected).toEqual([{ role: "R1", text: bad, reason: 'It names "NHS", which its lines don\'t.' }]);
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

  it("ignores a role that isn't on the profile and a role answered twice, counting what it leaves out", () => {
    const { suggestions, rejected } = build([
      role("R1", [[dashboards, [id(dashboards)]]]),
      role("R1", [[clean, [id(clean)]]]),
      role("R9", [["Ran the shop", [id(trained)]]]),
    ]);

    expect(suggestions.roles.map((item) => item.lines.map((line) => line.text))).toEqual([[dashboards]]);
    expect(rejected.map((item) => item.reason)).toEqual(["Role R1 was answered twice.", "There is no role R9 on the profile."]);
    expect(suggestions.dropped).toBe(2);
  });

  it(`keeps at most ${MAX_LINES_PER_ROLE} lines for a role, without repeats, and removes hidden characters`, () => {
    const lines: [string, string[]][] = [
      [`Built​ Tableau dashboards for the regional sales team`, [id(dashboards)]],
      [`${dashboards}.`, [id(dashboards)]],
      [clean, [id(clean)]],
      ["Cleaned and joined weekly sales data from 120 stores in SQL and Python", [id(clean)]],
      [report, [id(report)]],
      ["Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes", [id(report)]],
      ["Built dashboards in Tableau for the regional sales team", [id(dashboards)]],
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
    const daniel = personas.daniel;
    const deputy = "Managed deliveries, stockroom and a team of 12";

    const { suggestions } = build([role("R2", [[deputy, [idOf(daniel.profile, deputy)]]])], "daniel", daniel.jobs[0]);

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
    expect(checkWriting("Trained 4 new starters", [trained], [])).toBeNull();
    expect(checkWriting("Trained four new starters", ["Trained 4 new starters"], [])).toBeNull();
    const store = "Run a store with 45 staff and a turnover of £9 million a year";
    expect(checkWriting("Ran a store with a turnover of £9m", [store], [])).toBeNull();
    expect(checkWriting("Ran a store with a turnover of £9bn", [store], [])).toMatch(/"billion"/);
    expect(checkWriting("Coordinated a timetable for 1,100 students", ["Coordinated a new timetable for 1,100 students and 80 staff"], [])).toBeNull();
    expect(checkWriting("Served hundreds of customers on the tills", ["Served customers on the tills and the shop floor"], [])).toMatch(
      /"hundreds"/,
    );
  });

  it("finds a name anywhere but at the start of a sentence", () => {
    expect(checkWriting("Reported KPIs to the area manager", ["Report weekly sales KPIs to the area manager"], [])).toBeNull();
    expect(checkWriting("Reported KPIs to the area manager in Jira", ["Report weekly sales KPIs to the area manager"], [])).toMatch(/"Jira"/);
  });

  it("refuses a line too long for LinkedIn", () => {
    expect(checkWriting(`${dashboards} `.repeat(6), [dashboards], [])).toMatch(/too long/);
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
      expect(suggested.intro).toBe("");
      expect(findBrandProblems(suggested.lines.map((line) => line.text).join("\n"))).toEqual([]);
    }
  });

  it("leaves out a role none of whose lines names the ad's requirements", () => {
    const { suggestions } = buildLinkedInSuggestions(sara.profile, saraJob, sara.match, suggestByRules(sara.profile, saraJob));

    expect(suggestions.roles.map((item) => item.title)).toEqual(["Data Analyst Intern"]);
    expect(suggestions.otherRoles).toEqual(["Customer Assistant (part-time) at Greenway Foods"]);
    expect(suggestions.roles[0].lines.map((line) => line.text)).toEqual([clean, dashboards]);
  });

  it("gives a role only the skills its own lines name", () => {
    const daniel = personas.daniel;

    const { suggestions } = buildLinkedInSuggestions(daniel.profile, daniel.jobs[0], daniel.match, suggestByRules(daniel.profile, daniel.jobs[0]));

    expect(suggestions.roles.map((item) => [item.title, item.skills])).toEqual([
      ["Store Manager", ["KPI reporting", "Stock control"]],
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
