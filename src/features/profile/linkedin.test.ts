import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { findBrandProblems } from "@/features/tailor/brand-check";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import {
  buildLinkedInSuggestions,
  checkWriting,
  currentFindings,
  LinkedInAnswerSchema,
  linkedInRoles,
  linkedInTitle,
  MAX_LINES_PER_ROLE,
  nothingToWrite,
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
function write(name: PersonaName, roleId: string, text: string, sources: readonly string[], profile = personas[name].profile) {
  const from = sources.map((source) => idOf(profile, source));
  return build([role(roleId, [[text, from]])], name, personas[name].jobs[0], profile);
}

/** A persona's profile with one more follow-up answer. */
function withAnswer(name: PersonaName, question: string, answer: string): Profile {
  const { profile } = personas[name];
  return { ...profile, followUpAnswers: [...profile.followUpAnswers, { id: "extra", question, answer, answeredAt: "2026-10-21T09:00:00.000Z" }] };
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
  topRated: "Top-rated advisor in my team for customer satisfaction, three quarters running",
};
const reza = {
  taught: "Taught maths to classes of 30 across Key Stages 3 and 4",
  tutors: "Led a team of nine form tutors for a year group of 210 students",
  timetable: "Coordinated the move to a new school timetable for 1,100 students and 80 staff, delivered on time",
  budget: "Managed the year group's £15,000 trips and activities budget",
  years: "Taught maths to Years 7 to 11",
  club: "Organised the school's maths challenge club",
  gcse: "GCSE maths results in my classes rose from 62% to 71% at grade 4 or above",
};
const daniel = {
  store: "Run a store with 45 staff and a turnover of £9 million a year",
  pnl: "Own the store's profit and loss, wage budget and stock levels",
  kpis: "Report weekly sales, waste and availability KPIs to the area manager",
  loss: "Cut stock loss from 2.1% to 1.3% of sales in two years",
  award: "Store of the Year for the Midlands region, 2023",
  deliveries: "Managed deliveries, stockroom and a team of 12",
  covered: "Covered the store manager's role during absences",
  food: "Supervised the fresh food department and its team of eight",
};

const WORD = /^It says "[^"]+", which its lines don't\.$/;
const JOIN = /^It joins /;
const FIGURE = /which its lines don't say that way/;
const START = /^It starts with /;
const RANK = /^It calls the person /;
const LIMIT = /^It leaves out /;
const DENIED = /which its lines say didn't happen/;

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

  it("gives each answer to the one role it is about, by the company it names or the words only that role has", () => {
    expect(linkedInRoles(sara.profile).roles.map((item) => item.answers.map((answer) => answer.text))).toEqual([[saraAnswer], []]);

    const valewood = withAnswer("daniel", "How have you led health and safety in your stores?", "At Valewood I ran the weekly health and safety checks for the fresh food department.");
    expect(linkedInRoles(valewood).roles.map((item) => item.answers.length)).toEqual([0, 0, 1]);

    const greenway = withAnswer("sara", "Anything else?", "At Greenway Foods I trained the new starters on the tills and wrote a one-page guide for the team.");
    expect(linkedInRoles(greenway).roles[1].answers.map((answer) => answer.text)).toContain(
      "At Greenway Foods I trained the new starters on the tills and wrote a one-page guide for the team.",
    );
  });

  it("gives an answer to no role when it could be about two", () => {
    const both = withAnswer("daniel", "Anything else?", "As deputy at Hartley's I recruited and trained 15 new staff for the Wolverhampton store.");

    expect(linkedInRoles(both).roles.map((item) => item.answers.length)).toEqual([0, 0, 0]);
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
  it("says when a profile has no roles, or no lines under them, so no request is wasted", () => {
    expect(nothingToWrite(sara.profile)).toBeNull();
    expect(nothingToWrite({ ...sara.profile, experience: [] })).toBe("no-roles");
    const bare = { ...personas.daniel.profile, experience: personas.daniel.profile.experience.map((item) => ({ ...item, duties: [], achievements: [] })) };
    expect(nothingToWrite(bare)).toBe("no-lines");
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
    ["no line at all", "R1", [], /rests on no duty or result/],
    ["a line that isn't on the profile", "R1", ["L999"], /L999 is not a line of the profile/],
    ["another role's line", "R1", [trained], /belongs to another role/],
    ["only a skill and the summary", "R1", ["SQL", "L1"], /rests on no duty or result/],
    ["an answer about another role", "R2", [saraAnswer], /belongs to another role/],
  ])("drops a line that rests on %s", (_, roleId, sources, reason) => {
    const from = sources.map((source) => (/^L\d+$/.test(source) ? source : id(source)));

    const { suggestions, rejected } = build([role(roleId, [[roleId === "R2" ? "Walked the regional managers through the dashboard" : dashboards, from]])]);

    expect(suggestions.roles).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(reason);
  });

  // Each of these was kept by an earlier version of the checks. None may reach the user (Nothing invented), and each
  // must be stopped by the rule it is about.
  it.each([
    ["a rank", "sara", "R1", "Led the regional sales team", [dashboards], WORD],
    ["a wider scope", "sara", "R1", "Built Tableau dashboards for the international sales team", [dashboards], WORD],
    ["a tool at the start", "sara", "R1", "Looker dashboards built for the regional sales team", [dashboards], WORD],
    ["a tool that starts like a word of the line", "sara", "R1", "Salesforce dashboards built for the regional sales team", [dashboards], WORD],
    ["a short tool name", "sara", "R1", "Cleaned and joined weekly sales data from 120 stores using SQL, dbt and Python", [clean], WORD],
    ["more than the figure", "sara", "R1", "Cleaned and joined weekly sales data from more than 120 stores using SQL and Python", [clean], WORD],
    ["running the shop", "sara", "R2", "Ran the shop", [served], WORD],
    ["a manager's title", "sara", "R2", "Trained four new starters as shop floor manager", [trained, served], WORD],
    ["leading senior colleagues", "emma", "R1", "Led two senior developers in reviewing pull requests", [emma.review], WORD],
    ["a result", "emma", "R1", "Rebuilt a client's booking form, doubling bookings and reducing abandoned bookings by 18%", [emma.booking], WORD],
    ["founding", "reza", "R2", "Founded the school's maths challenge club", [reza.club], WORD],
    ["setting up", "reza", "R2", "Set up and ran the school's maths challenge club", [reza.club], WORD],
    ["growth", "daniel", "R1", "Grew a store with 45 staff to a turnover of £9 million a year", [daniel.store], WORD],
    ["a method the CV doesn't name", "daniel", "R1", "Cut stock loss from 2.1% to 1.3% of sales in two years through kaizen", [daniel.loss], WORD],
    ["a skill the match found missing", "emma", "R1", "Build and maintain tested React and TypeScript websites for six agency clients", [emma.build], WORD],
    ["a tool run together", "sara", "R1", "PowerBI dashboards built for the regional sales team", [dashboards], WORD],
    ["a verb from another line, for leading", "reza", "R1", "Led the move to a new school timetable for 1,100 students and 80 staff", [reza.tutors, reza.timetable], JOIN],
    ["a verb from another line, for managing", "reza", "R1", "Managed a team of nine form tutors for a year group of 210 students", [reza.tutors, reza.budget], JOIN],
    ["a verb from another line, for automating", "sara", "R1", "Automated Tableau dashboards for the regional sales team", [dashboards, report], JOIN],
    ["a second verb from another line", "reza", "R1", "Led a team of nine form tutors for a year group of 210 students and managed 80 staff", [reza.tutors, reza.timetable, reza.budget], JOIN],
    ["a list item from another line", "daniel", "R1", "Cut stock loss and waste from 2.1% to 1.3% of sales in two years", [daniel.loss, daniel.kpis], JOIN],
    ["one client's result for every client", "emma", "R1", "Build and maintain React and TypeScript websites for six agency clients, reducing abandoned bookings by 18%", [emma.build, emma.booking], JOIN],
    ["one line's result for another line's duty", "sara", "R1", "Built Tableau dashboards for the regional sales team, cutting preparation time from 4 hours to 30 minutes", [dashboards, report], JOIN],
    ["a figure in front of another line's verb", "reza", "R1", "For 1,100 students and 80 staff, managed the year group's £15,000 trips and activities budget", [reza.timetable, reza.budget], START],
    ["a senior title from colleagues", "emma", "R1", "Senior developer: build and maintain React and TypeScript websites for six agency clients and review pull requests", [emma.build, emma.review], START],
    ["what a verb acts on", "reza", "R1", "Coordinated 80 staff", [reza.timetable], START],
    ["seniority from a colleague", "emma", "R1", "Review pull requests as a senior developer", [emma.review], RANK],
    ["seniority over colleagues", "emma", "R1", "Review pull requests from two senior developers", [emma.review], RANK],
    ["someone else's rank", "daniel", "R1", "Report weekly sales, waste and availability KPIs as the area manager", [daniel.kpis], RANK],
    ["whose classes they were", "reza", "R2", "GCSE maths results rose from 62% to 71% at grade 4 or above", [reza.gcse], LIMIT],
    ["whose team it was", "emma", "R2", "Top-rated advisor for customer satisfaction, three quarters running", [emma.topRated], LIMIT],
    ["where the award was", "daniel", "R1", "Store of the Year, 2023", [daniel.award], LIMIT],
  ] as const)("drops a line that adds %s", (_, name, roleId, text, sources, reason) => {
    const { suggestions, rejected } = write(name, roleId, text, sources);

    expect(suggestions.roles).toEqual([]);
    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(reason)]);
  });

  it.each([
    ["counting something else", "daniel", "R1", "Ran 9 stores with 45 staff and a turnover of £45 million a year", [daniel.store]],
    ["swapping what two figures count", "reza", "R1", "Coordinated the move to a new school timetable for 80 schools and 1,100 staff, delivered on time", [reza.timetable]],
    ["turning class size into a number of classes", "reza", "R1", "Taught maths to 30 classes across Key Stages 3 and 4", [reza.taught]],
    ["taking a percentage as a count", "emma", "R1", "Build and maintain React and TypeScript websites for 18 agency clients", [emma.build]],
    ["turning a change into a cut", "daniel", "R1", "Cut stock loss by 2.1% of sales in two years", [daniel.loss]],
    ["taking a sum for a count", "reza", "R1", "Managed the year group's 15,000 trips and activities budget", [reza.budget]],
    ["a bigger group", "reza", "R1", "Led a team of nine form tutors for 1,100 students", [reza.tutors, reza.timetable]],
    ["a sum from another line", "daniel", "R1", "Run a store with 45 staff and a £9 million wage budget", [daniel.store, daniel.pnl]],
    ["a year from another line", "daniel", "R1", "Cut stock loss from 2.1% to 1.3% of sales in 2023", [daniel.loss, daniel.award]],
  ] as const)("drops a figure %s", (_, name, roleId, text, sources) => {
    const { rejected } = write(name, roleId, text, sources);

    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(FIGURE)]);
  });

  it.each([
    ["the summary", "sara", "R2", "Cleaned and analysed retail sales data in Python and SQL", [served, "Data science graduate with hands-on experience cleaning and analysing retail sales data in Python and SQL."]],
    ["a skill", "sara", "R2", "Served customers on the tills and the shop floor using SQL", [served, "SQL"]],
    ["a certificate from later on", "daniel", "R3", "Supervised the fresh food department and its team of eight with IOSH Managing Safely", [daniel.food, "IOSH Managing Safely, IOSH, 2020"]],
    ["the role's title", "reza", "R1", "Maths teacher and head of school for 1,100 students and 80 staff", [reza.timetable]],
  ] as const)("never takes words for a role's line from %s", (_, name, roleId, text, sources) => {
    const { rejected } = write(name, roleId, text, sources);

    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(WORD)]);
  });

  it("never takes a duty from an answer about another employer", () => {
    const profile = withAnswer("daniel", "How have you led health and safety in your stores?", "At Valewood I ran the weekly health and safety checks for the fresh food department.");

    const { rejected } = write("daniel", "R1", "Run the weekly health and safety checks for the fresh food department", ["At Valewood I ran the weekly health and safety checks for the fresh food department."], profile);

    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(/belongs to another role/)]);
  });

  it("never takes what an answer says didn't happen", () => {
    const answer = "I never presented to the regional managers myself; my manager presented the dashboards and I wrote a one-page summary.";
    const profile = withAnswer("sara", "Did you present your dashboards to the managers?", answer);

    const { suggestions, rejected } = write("sara", "R1", "Wrote a one-page summary and presented the dashboards to the regional managers", [answer], profile);
    const power = withAnswer("sara", "Have you used Power BI?", "I have never used Power BI; all my dashboards were in Tableau.");
    const denied = write("sara", "R1", "Used Power BI for the regional sales team", ["I have never used Power BI; all my dashboards were in Tableau."], power);

    expect(suggestions.roles).toEqual([]);
    expect(rejected.map((item) => item.reason)).toEqual([expect.stringMatching(DENIED)]);
    expect(denied.suggestions.roles).toEqual([]);
  });

  it.each([
    ["a later clause brought to the front", "sara", "R1", "Cut preparation time from 4 hours to 30 minutes by automating a weekly stock report", [report]],
    ["the second of two verbs", "sara", "R1", "Joined weekly sales data from 120 stores using SQL and Python", [clean]],
    ["£15k for £15,000", "reza", "R1", "Managed the year group's £15k trips and activities budget", [reza.budget]],
    ["the present tense of an irregular verb", "reza", "R1", "Lead a team of nine form tutors for a year group of 210 students", [reza.tutors]],
    ["another irregular verb", "reza", "R2", "Teach maths to Years 7 to 11", [reza.years]],
    ["a prefixed irregular verb", "emma", "R1", "Rebuild a client's booking form, reducing abandoned bookings by 18%", [emma.booking]],
    ["P&L for profit and loss", "daniel", "R1", "Own the store's P&L, wage budget and stock levels", [daniel.pnl]],
    ["a rank as the line uses it", "daniel", "R1", "Reported weekly sales, waste and availability KPIs to the area manager", [daniel.kpis]],
    ["a role covered, in fewer words", "daniel", "R2", "Covered for the store manager during absences", [daniel.covered]],
    ["senior colleagues, still colleagues", "emma", "R1", "Reviewed pull requests with two senior developers", [emma.review]],
    ["the role's own title after as", "reza", "R1", "Led a team of nine form tutors as Head of Year 9", [reza.tutors]],
    ["a figure in digits", "sara", "R2", "Trained 4 new starters", [trained]],
    ["a year", "daniel", "R1", "Store of the Year for the Midlands region in 2023", [daniel.award]],
    ["two lines of the same role", "daniel", "R1", "Run a store with 45 staff and a turnover of £9 million a year, and own its profit and loss", [daniel.store, daniel.pnl]],
    ["a duty and an answer about it", "sara", "R1", "Built Tableau dashboards for the regional sales team and walked the regional managers through the dashboard every Monday", [dashboards, saraAnswer]],
    ["the first item of a list left out", "daniel", "R2", "Managed a team of 12", [daniel.deliveries]],
    ["an item of a list on its own", "daniel", "R1", "Own the wage budget and stock levels", [daniel.pnl]],
    ["one of two verbs left out", "sara", "R1", "Cleaned weekly sales data from 120 stores using SQL and Python", [clean]],
    ["a few words left out", "reza", "R1", "Led nine form tutors for a year group of 210 students", [reza.tutors]],
    ["a joined verb left out", "emma", "R1", "Build React and TypeScript websites for six agency clients", [emma.build]],
    ["fewer words before what a figure counts", "emma", "R1", "Build and maintain React and TypeScript websites for six clients", [emma.build]],
  ] as const)("keeps an honest line with %s", (_, name, roleId, text, sources) => {
    const { suggestions, rejected } = write(name, roleId, text, sources);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines.map((line) => line.text)).toEqual([text]);
  });

  it.each(names)("keeps every duty and result of %s's CV written word for word, and as the role's only line", (name) => {
    const { profile } = personas[name];

    for (const block of linkedInRoles(profile).roles) {
      for (const line of block.lines) {
        expect(checkWriting(line.text, { evidence: [line.text], title: block.experience.title }), line.text).toBeNull();
      }
    }
  });

  it("keeps a line that starts with an answer and goes on with a duty of the same role", () => {
    const answer = "Yes, every Friday afternoon.";
    const profile = withAnswer("daniel", "Did you run the fresh food department's weekly stock count at Valewood?", answer);
    const line = "Every Friday afternoon, supervised the fresh food department and its team of eight";

    const { suggestions, rejected } = write("daniel", "R3", line, [daniel.food, answer], profile);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines.map((item) => item.text)).toEqual([line]);
  });

  it("reads US spelling in the CV as the UK spelling the brand writes", () => {
    const analyzed = "Analyzed weekly sales data from 120 stores using SQL and Python";
    const profile = { ...sara.profile, experience: [{ ...sara.profile.experience[0], duties: [analyzed] }, sara.profile.experience[1]] };

    const { suggestions, rejected } = write("sara", "R1", "Analysed weekly sales data from 120 stores using SQL and Python", [analyzed], profile);

    expect(rejected).toEqual([]);
    expect(suggestions.roles[0].lines[0].reworded).toBe(true);
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

  it("gives a role only the skills its own duties and results show: a team needs someone leading it", () => {
    const { profile } = personas.daniel;
    const skills = profile.skills.map((skill) => idOf(profile, skill));

    const { suggestions } = build(
      [
        role("R1", [[daniel.pnl, [idOf(profile, daniel.pnl)]]], skills),
        role("R2", [[daniel.deliveries, [idOf(profile, daniel.deliveries)]]], skills),
        role("R3", [[daniel.food, [idOf(profile, daniel.food)]]], skills),
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
      [role("R1", [[dashboards, [idOf(profile, dashboards)]]], ["Team leadership"]), role("R2", [[trained, [idOf(profile, trained)]]], ["Time management"])],
      "sara",
      sara.jobs[0],
      profile,
    );

    expect(suggestions.roles.map((item) => item.skills)).toEqual([[], []]);
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
    const profile = withAnswer("sara", "Have you used Power BI?", "I have never used Power BI; all my dashboards were in Tableau.");

    expect(currentFindings(profile, sara.jobs[0], sara.match).get("Power BI")).toBe("missing");
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

  it("keeps figures that aren't one number apart", () => {
    expect(checkWriting("Taught maths to Key Stages 1,2", { evidence: ["Taught maths to Key Stages 3,4"] })).toMatch(FIGURE);
    expect(checkWriting("Upgraded the site to React 19.1.0", { evidence: ["Upgraded the site to React 16.8.0"] })).toMatch(FIGURE);
  });

  it("keeps the main verb where the lines have it: helping to manage is not managing", () => {
    const helped = "Helped manage the weekly stock count";

    expect(checkWriting("Managed the weekly stock count", { evidence: [helped] })).toMatch(/starts with "Managed"/);
    expect(checkWriting("Helped manage the weekly stock count", { evidence: [helped] })).toBeNull();
  });

  it.each([
    ["Identified", "Identify"],
    ["Carried out", "Carry out"],
    ["Applied", "Apply"],
    ["Studied", "Study"],
    ["Oversaw", "Oversee"],
    ["Undertook", "Undertake"],
    ["Drew up", "Draw up"],
    ["Rewrote", "Rewrite"],
    ["Rebuilt", "Rebuild"],
    ["Met", "Meet"],
  ])("reads %s and %s as the same verb", (past, present) => {
    expect(checkWriting(`${present} the weekly stock count`, { evidence: [`${past} the weekly stock count`] })).toBeNull();
  });

  it("refuses a line too long for LinkedIn", () => {
    expect(checkWriting(`${dashboards} `.repeat(6), { evidence: [dashboards] })).toMatch(/too long/);
  });
});

describe("suggestByRules, the mock answer", () => {
  it.each(cases)("$name, job $number: only each role's own lines, word for word, and all of them kept", ({ name, number, job }) => {
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
      for (const line of suggested.lines) {
        expect(own).toContain(line.text);
        expect(line.reworded).toBe(false);
      }
      for (const skill of suggested.skills) expect(profile.skills).toContain(skill);
      expect(findBrandProblems(suggested.lines.map((line) => line.text).join("\n"))).toEqual([]);
    }
  });

  it("picks the lines the match used as evidence, and leaves out a role with none that shows the ad's requirements", () => {
    const { suggestions } = buildLinkedInSuggestions(sara.profile, sara.jobs[0], sara.match, suggestByRules(sara.profile, sara.jobs[0], sara.match));

    expect(suggestions.roles.map((item) => item.title)).toEqual(["Data Analyst Intern"]);
    expect(suggestions.otherRoles).toEqual(["Customer Assistant (part-time) at Greenway Foods"]);
    expect(suggestions.roles[0].lines.map((line) => line.text)).toEqual([clean, dashboards]);

    const rezaLines = suggestByRules(personas.reza.profile, personas.reza.jobs[0], personas.reza.match).roles[0].lines.map((line) => line.text);
    expect(rezaLines).toContain("Ran parents' evenings and kept parents updated on progress");
  });

  it("never picks a line for a requirement the profile doesn't show", () => {
    const { profile, jobs } = personas.reza;

    const sample = suggestByRules(profile, jobs[1], matchFor("reza", jobs[1]));

    expect(sample.roles.flatMap((item) => item.lines.map((line) => line.text))).not.toContain("Managed the year group's £15,000 trips and activities budget");
  });
});

describe("the model's answer format", () => {
  it("converts to a structured output format", () => {
    expect(() => zodOutputFormat(LinkedInAnswerSchema)).not.toThrow();
  });
});
