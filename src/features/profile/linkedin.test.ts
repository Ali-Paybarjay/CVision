import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import {
  buildLinkedInSuggestions,
  currentFindings,
  LINKEDIN_DESCRIPTION_CHARACTERS,
  LinkedInAnswerSchema,
  linkedInRoles,
  linkedInTitle,
  MAX_LINES_PER_ROLE,
  nothingToWrite,
  requirementFindings,
  suggestByRules,
  type LinkedInAnswer,
} from "./linkedin";
import { assessByRules, buildMatchResult, profileEvidenceLines, type EvidenceKind } from "./match";

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

/** The id of the profile's first line of one kind. */
function idOfKind(profile: Profile, kind: EvidenceKind): string {
  const line = profileEvidenceLines(profile).find((item) => item.kind === kind);
  if (!line) throw new Error(`No ${kind} line`);
  return line.id;
}

type RoleAnswer = LinkedInAnswer["roles"][number];
function role(roleId: string, lines: string[], skills: string[] = []): RoleAnswer {
  return { role: roleId, lines, skills };
}
function build(roles: RoleAnswer[], name: PersonaName = "sara", job: Job = personas[name].jobs[0], profile = personas[name].profile) {
  return buildLinkedInSuggestions(profile, job, matchFor(name, job, profile), { roles });
}

/** Sara's profile with other duties for her first role. */
function withDuties(duties: string[]): Profile {
  const { profile } = personas.sara;
  return { ...profile, experience: [{ ...profile.experience[0], duties, achievements: [] }, profile.experience[1]] };
}

const sara = personas.sara;
const clean = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
const dashboards = "Built Tableau dashboards for the regional sales team";
const report = "Automated a weekly stock report, cutting preparation time from 4 hours to 30 minutes";
const served = "Served customers on the tills and the shop floor";
const trained = "Trained four new starters";
const saraAnswer = sara.profile.followUpAnswers[0].answer;
const id = (text: string) => idOf(sara.profile, text);

const daniel = {
  pnl: "Own the store's profit and loss, wage budget and stock levels",
  deliveries: "Managed deliveries, stockroom and a team of 12",
  covered: "Covered the store manager's role during absences",
  food: "Supervised the fresh food department and its team of eight",
};

describe("linkedInRoles", () => {
  it("puts each role's duties and results under it, with the same ids as the match, and nothing else", () => {
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

describe("nothingToWrite", () => {
  it("says when a profile has no roles, or no duties or results under them, so no request is wasted", () => {
    expect(nothingToWrite(sara.profile)).toBeNull();
    expect(nothingToWrite({ ...sara.profile, experience: [] })).toBe("no-roles");
    const bare = { ...personas.daniel.profile, experience: personas.daniel.profile.experience.map((item) => ({ ...item, duties: [], achievements: [] })) };
    expect(nothingToWrite(bare)).toBe("no-lines");
    // Answers are not lines of the CV, so they don't count.
    expect(nothingToWrite({ ...sara.profile, experience: sara.profile.experience.map((item) => ({ ...item, duties: [], achievements: [] })) })).toBe("no-lines");
  });
});

describe("buildLinkedInSuggestions", () => {
  it("shows the lines the model chose exactly as the CV says them, best first, and reads ids written loosely", () => {
    const { suggestions, rejected } = build([role("R1", [id(report), ` ${id(dashboards).toLowerCase()} `])]);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines).toEqual([report, dashboards]);
    expect(suggestions.dropped).toBe(0);
  });

  it.each([
    ["another role's line", () => id(trained), /^L\d+ belongs to another role\.$/],
    ["an answer", () => id(saraAnswer), /^L\d+ is not a duty or result of this role\.$/],
    ["the summary", () => idOfKind(sara.profile, "summary"), /^L\d+ is not a duty or result of this role\.$/],
    ["a skill", () => idOfKind(sara.profile, "skill"), /^L\d+ is not a duty or result of this role\.$/],
    ["the role's own title line", () => idOfKind(sara.profile, "role"), /^L\d+ is not a duty or result of this role\.$/],
    ["an id the profile doesn't have", () => "L999", /^L999 is not a line of the profile\.$/],
    ["a line written instead of an id", () => "Led the regional sales team", /is not a line of the profile\.$/],
  ])("never shows %s as a line, and counts it as left out", (_, value, reason) => {
    const { suggestions, rejected } = build([role("R1", [value()])]);

    expect(suggestions.roles).toEqual([]);
    expect(suggestions.otherRoles).toHaveLength(2);
    expect(rejected).toEqual([{ role: "R1", text: value(), reason: expect.stringMatching(reason) }]);
    expect(suggestions.dropped).toBe(1);
  });

  it("counts only what isn't on the CV: not an empty id, nor a second answer for the same role", () => {
    const { suggestions, rejected } = build([role("R1", [id(dashboards), "  "]), role("R1", [id(clean)]), role("R9", [id(served)])]);

    expect(suggestions.roles.map((item) => item.lines)).toEqual([[dashboards]]);
    expect(rejected).toEqual([{ role: "R9", text: id(served), reason: "There is no role R9 on the profile." }]);
    expect(suggestions.dropped).toBe(1);
  });

  it(`keeps at most ${MAX_LINES_PER_ROLE} lines for a role, without repeats, and tidies hidden characters and bullets`, () => {
    const duties = ["• Built​ Tableau dashboards for the regional sales team", "Ran A", "Ran B", "Ran C", "Ran D", "Ran E", "Ran F"];
    const profile = withDuties(duties);
    const ids = duties.map((duty) => idOf(profile, duty));

    const { suggestions, rejected } = build([role("R1", [ids[0], ids[0], ...ids.slice(1)])], "sara", sara.jobs[0], profile);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines).toEqual([dashboards, "Ran A", "Ran B", "Ran C", "Ran D"]);
  });

  it(`keeps a role's lines within LinkedIn's ${LINKEDIN_DESCRIPTION_CHARACTERS} characters for a description, as they are copied`, () => {
    const long = ["A", "B", "C"].map((letter) => `Ran ${letter} ${"x".repeat(895)}`);
    const profile = withDuties(long);

    const { suggestions } = build([role("R1", long.map((duty) => idOf(profile, duty)))], "sara", sara.jobs[0], profile);

    // Copied as "• line", one a line: two come to 1,807 characters, a third would make 2,711.
    expect(suggestions.roles[0].lines).toEqual(long.slice(0, 2));
  });

  it("keeps the skills the role's own lines show, by id or by name, and drops the rest", () => {
    const { suggestions, rejected } = build([role("R1", [id(dashboards)], [id("SQL"), "tableau", id("Excel"), "Power BI", id(clean)])]);

    expect(suggestions.roles[0].skills).toEqual(["SQL", "Tableau"]);
    expect(rejected.map((item) => [item.text, item.reason])).toEqual([
      ["Excel", "The role's own lines don't show this skill."],
      ["Power BI", "It is not a skill on the profile."],
      [id(clean), "It is not a skill on the profile."],
    ]);
  });

  it("gives a role only the skills its own duties and results show: a team needs someone leading it", () => {
    const { profile } = personas.daniel;
    const skills = profile.skills.map((skill) => idOf(profile, skill));

    const { suggestions } = build(
      [
        role("R1", [idOf(profile, daniel.pnl)], skills),
        role("R2", [idOf(profile, daniel.deliveries)], skills),
        role("R3", [idOf(profile, daniel.food)], skills),
      ],
      "daniel",
    );

    expect(suggestions.roles.map((item) => [item.title, item.skills])).toEqual([
      ["Store Manager", ["P&L management", "KPI reporting", "Stock control"]],
      ["Deputy Store Manager", ["Team leadership"]],
      ["Department Supervisor", ["Team leadership"]],
    ]);
  });

  it("never gives a role a skill from a general word alone", () => {
    const profile = { ...sara.profile, skills: [...sara.profile.skills, "Team leadership", "Time management"] };

    const { suggestions } = build(
      [role("R1", [idOf(profile, dashboards)], ["Team leadership"]), role("R2", [idOf(profile, trained)], ["Time management"])],
      "sara",
      sara.jobs[0],
      profile,
    );

    expect(suggestions.roles.map((item) => item.skills)).toEqual([[], []]);
  });

  it("takes LinkedIn's other fields from the CV, never from the model", () => {
    const { suggestions } = build([role("R2", [id(trained)])]);

    expect(suggestions.roles[0]).toMatchObject({
      id: "R2",
      title: "Customer Assistant",
      cvTitle: "Customer Assistant (part-time)",
      employmentType: "Part-time",
      company: "Greenway Foods",
      location: "Leeds",
      period: "Jan 2022 to Jun 2024",
      sameCompanyAs: null,
      lines: [trained],
    });
    expect(suggestions.otherRoles).toEqual(["Data Analyst Intern at Northgate Retail Insights"]);
  });

  it("says when a role is at the same company as an earlier one, as LinkedIn lists both under it", () => {
    const { suggestions } = build([role("R2", [idOf(personas.daniel.profile, daniel.covered)])], "daniel");

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

describe("requirementFindings and currentFindings", () => {
  it("reads met, unclear and missing from the match, and nothing without one", () => {
    const findings = requirementFindings(sara.match);

    expect(findings.get("Strong SQL")).toBe("met");
    expect(findings.get("Clear communication with non-technical stakeholders")).toBe("unclear");
    expect(findings.get("Healthcare or NHS data")).toBe("missing");
    expect(requirementFindings(null).size).toBe(0);
  });

  it("counts a requirement as met once the user shows it in a duty, though the saved match says missing", () => {
    const added = "Built Power BI dashboards for the finance team";
    const profile = { ...sara.profile, experience: [{ ...sara.profile.experience[0], duties: [...sara.profile.experience[0].duties, added] }, sara.profile.experience[1]] };

    expect(currentFindings(sara.profile, sara.jobs[0], sara.match).get("Power BI")).toBe("missing");
    expect(currentFindings(profile, sara.jobs[0], sara.match).get("Power BI")).toBe("met");
    expect(buildLinkedInSuggestions(profile, sara.jobs[0], sara.match, { roles: [] }).suggestions.notShown.map((item) => item.requirement)).not.toContain("Power BI");
  });

  it("never counts a requirement as met from an answer, which may say the user hasn't done it", () => {
    const { profile } = sara;
    const denied = {
      ...profile,
      followUpAnswers: [...profile.followUpAnswers, { id: "extra", question: "Have you used Power BI?", answer: "I have never used Power BI; all my dashboards were in Tableau.", answeredAt: "2026-10-21T09:00:00.000Z" }],
    };

    expect(currentFindings(denied, sara.jobs[0], sara.match).get("Power BI")).toBe("missing");
  });
});

describe("suggestByRules, the mock answer", () => {
  it.each(cases)("$name, job $number: only each role's own lines, as the CV says them, and all of them kept", ({ name, number, job }) => {
    const { profile } = personas[name];

    const sample = suggestByRules(profile, job, matchFor(name, job));
    const { suggestions, rejected } = buildLinkedInSuggestions(profile, job, matchFor(name, job), LinkedInAnswerSchema.parse(sample));

    expect(rejected).toEqual([]);
    // Each persona's first job is a good fit, so the demo always has lines for it.
    if (number === 1) expect(suggestions.roles.length).toBeGreaterThan(0);
    const { roles } = linkedInRoles(profile);
    for (const suggested of suggestions.roles) {
      const own = roles.find((item) => item.id === suggested.id)?.lines.map((line) => line.text) ?? [];
      expect(suggested.lines.length).toBeGreaterThan(0);
      expect(suggested.lines.length).toBeLessThanOrEqual(MAX_LINES_PER_ROLE);
      for (const line of suggested.lines) expect(own).toContain(line);
      for (const skill of suggested.skills) expect(profile.skills).toContain(skill);
    }
  });

  it("picks the lines the match used as evidence, and leaves out a role with none that shows the ad's requirements", () => {
    const { suggestions } = buildLinkedInSuggestions(sara.profile, sara.jobs[0], sara.match, suggestByRules(sara.profile, sara.jobs[0], sara.match));

    expect(suggestions.roles.map((item) => item.title)).toEqual(["Data Analyst Intern"]);
    expect(suggestions.otherRoles).toEqual(["Customer Assistant (part-time) at Greenway Foods"]);
    expect(suggestions.roles[0].lines).toEqual([clean, dashboards]);

    const reza = personas.reza;
    const rezaLines = suggestByRules(reza.profile, reza.jobs[0], reza.match).roles[0].lines;
    expect(rezaLines).toContain(idOf(reza.profile, "Ran parents' evenings and kept parents updated on progress"));
  });

  it("never picks a line for a requirement the profile doesn't show", () => {
    const { profile, jobs } = personas.reza;

    const sample = suggestByRules(profile, jobs[1], matchFor("reza", jobs[1]));

    expect(sample.roles.flatMap((item) => item.lines)).not.toContain(idOf(profile, "Managed the year group's £15,000 trips and activities budget"));
  });
});

describe("the model's answer format", () => {
  it("converts to a structured output format", () => {
    expect(() => zodOutputFormat(LinkedInAnswerSchema)).not.toThrow();
  });
});
