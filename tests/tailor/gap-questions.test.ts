import { describe, expect, it } from "vitest";
import { askGapQuestions, asksIfVerified, gapQuestionsPrompt, pickQuestions, questionGaps, skillGaps, strongerGaps } from "@/features/tailor";
import type { GapQuestion } from "@/features/tailor";
import type { Gap } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const gap = (id: string, requirement: string): Gap => ({ ...personas.sara.match.gaps[0], id, requirement });

describe("the gap questions ask only about skills and experience", () => {
  it.each([
    "Full UK driving licence",
    "Full clean driving licence",
    "Right to work in the UK",
    "Willing to travel",
    "Willingness to travel within the UK and internationally",
    "Visa sponsorship is not available",
    "Available for weekend shifts",
    "Available to work weekends",
    "Weekend and night shift cover when needed",
    "DBS check",
    "Enhanced DBS check",
    "Full UK licence",
    "Clean full UK licence",
  ])("never asks about %s", (requirement) => {
    expect(skillGaps([gap("a", requirement)])).toEqual([]);
  });

  it.each([
    "Power BI",
    "Stakeholder communication",
    "Managing a budget",
    "Gas Safe licence",
    // A licence to practise is a professional registration, not a driving licence (#401).
    "Full licence to practise",
    "Registered independent prescriber (V300) with a full licence to practise",
    "Full GMC registration with a licence to practise",
    // Real skills and experience that only contain a word from a condition (#246).
    "Experience designing high-availability systems",
    "Experience processing payroll and salary changes",
    "Experience carrying out right to work checks",
    "Processing DBS checks for new starters",
    "Experience leading shift teams",
    "Knowledge of UK visa and immigration casework",
    "Improvisation skills",
    "Experience managing staff relocation",
    "Experience securing corporate sponsorship",
    "Experience improving on-shelf availability",
    "Knowledge of salary benchmarking",
  ])("still asks about %s", (requirement) => {
    expect(skillGaps([gap("a", requirement)])).toHaveLength(1);
  });

  it("writes no question for a gap it leaves out", async () => {
    const { profile, jobs, match } = personas.sara;
    const questions = await askGapQuestions({ profile, job: jobs[0], match: { ...match, gaps: [gap("a", "Power BI"), gap("b", "Full driving licence")] } });
    expect(questions.map((item) => item.gapId)).toEqual(["a"]);
  });
});

describe("a degree, certificate or language the CV shows is never a Make it stronger question (#440)", () => {
  const { profile, jobs, match } = personas.sara;
  const withLines = {
    ...profile,
    education: [{ institution: "Harrowgate University", qualification: "BSc", subject: "Chemical Engineering" }],
    certifications: [{ name: "NEBOSH General Certificate", issuer: "NEBOSH", year: 2021 }],
    languages: [{ name: "Welsh", level: "Fluent" }],
  };
  const stronger = (requirement: string, evidence: string) => strongerGaps(jobs[0], { ...match, strengths: [{ requirement, evidence }] }, withLines);

  it.each([
    ["Accredited degree in Chemical Engineering", "BSc in Chemical Engineering, Harrowgate University"],
    ["Health and safety qualification", "NEBOSH General Certificate, NEBOSH, 2021"],
    ["Welsh speaker", "Welsh (Fluent)"],
  ])("leaves out %s, shown by an education, certificate or language line", (requirement, evidence) => {
    expect(stronger(requirement, evidence)).toEqual([]);
  });

  it.each(["At least 3 years' experience in process design", "5+ years in field service", "A positive attitude", "Enthusiasm for data", "Self-motivated", "Willingness to learn", "Team player"])(
    "leaves out %s, which the CV's dates show or no answer can add to",
    (requirement) => {
      expect(stronger(requirement, "A fictional duty line")).toEqual([]);
    },
  );

  it.each([
    "Ability to work with a high degree of accuracy",
    "Experience supervising PhD students",
    "Managing patient registration",
    "Testing and certification of electrical installations",
    "Software licence management",
    "Working with children aged 0-5 years",
    "Fault diagnosis to component level",
  ])("still makes %s stronger when a work line shows it", (requirement) => {
    expect(stronger(requirement, "A fictional duty line")).toHaveLength(1);
  });

  it("still asks about an unclear degree gap, since a degree in another subject or a lower one is a real gap", () => {
    expect(skillGaps([{ ...gap("d", "BEng in Chemical Engineering"), kind: "unclear" }])).toHaveLength(1);
  });
});

describe("never shows a question whether something in the CV is accredited or recognised (#440)", () => {
  it.each([
    "Is your BSc in Chemical Engineering from Harrowgate University accredited?",
    "Is your degree accredited by IChemE?",
    "Has your degree been recognised by UK ENIC?",
    "Is it IChemE-accredited?",
    "Was your degree assessed as equivalent to a UK bachelor's degree?",
  ])("drops: %s", (question) => {
    expect(asksIfVerified.test(question)).toBe(true);
  });

  it.each([
    "Which recognised awarding bodies have you worked with?",
    "In your current role at Fenmoor, did you lead HAZOP reviews?",
    "Have you used SolidWorks or an equivalent 3D CAD tool?",
    "Is your current team bigger than five people?",
    // Whether a registration is current makes a CV line for a nurse, so this one stays.
    "Is your NMC registration current?",
    "Did you write validated test methods at Kestrel Energy Lab?",
  ])("keeps: %s", (question) => {
    expect(asksIfVerified.test(question)).toBe(false);
  });

  it("leaves the question out of the ones shown, and keeps the rest", () => {
    const degree = { ...gap("deg", "Accredited degree in Chemical Engineering"), kind: "unclear" as const };
    const sql = gap("sql", "Strong SQL");
    const questions: GapQuestion[] = [
      { gapId: "deg", question: "Is your BSc in Chemical Engineering from Harrowgate University accredited?" },
      { gapId: "sql", question: "At Northgate, which databases did you query in SQL?" },
    ];
    expect(pickQuestions(questions, [degree, sql], []).map((item) => item.gapId)).toEqual(["sql"]);
  });

  it("tells the model to skip a degree whose only unclear part is its accreditation, and never to ask an open question", async () => {
    const { profile, jobs, match } = personas.sara;
    const prompt = await gapQuestionsPrompt({ profile, job: jobs[0], gaps: match.gaps });
    expect(prompt).toContain("Never ask whether something in their CV is accredited, recognised, verified or UK-equivalent.");
    expect(prompt).toContain("A degree in another subject or at a lower level is a real gap");
    expect(prompt).toContain("Fewer than 5 questions is better than one that adds nothing.");
    expect(prompt).toContain('Never an open "How did you…"');
    expect(prompt).toContain("never name one employer in it");
    expect(prompt).toContain("their No must mean they have not done it anywhere");
    expect(prompt).toContain("Give options for every question, with two exceptions.");
    expect(prompt).toContain("A question that asks for a number, how often, or a result: give no options");
    expect(prompt).toContain("never from the ad");
    expect(prompt).toContain("For an `unclear` gap, first name the CV line it rests on in a short sentence of its own, without its employer, then ask.");
    expect(prompt).toContain("or a course, degree, project or volunteering of theirs");
    expect(prompt).toContain("Write the employer's name exactly as their CV does.");
    expect(prompt).not.toContain("closest real version");
  });
});

describe("the gap questions prompt", () => {
  it("finds the role first and keeps the ad's own words (#401)", async () => {
    const { profile, jobs, match } = personas.sara;
    const prompt = await gapQuestionsPrompt({ profile, job: jobs[0], gaps: match.gaps });
    expect(prompt).toContain("## The role first");
    expect(prompt).toContain("use the ad's own words");
    expect(prompt).not.toContain("no jargon");
    expect(prompt.indexOf("## The role first")).toBeLessThan(prompt.indexOf("## How to ask"));
  });

  it("gives the model the whole ad, not just the requirements", async () => {
    const { profile, jobs, match } = personas.sara;
    const prompt = await gapQuestionsPrompt({ profile, job: jobs[0], gaps: match.gaps });
    expect(prompt).toContain(JSON.stringify(jobs[0].description));
  });
});

describe("Make it stronger: questions from strengths, up to five in all", () => {
  const { profile, jobs, match } = personas.sara;
  const job = jobs[0];

  it("turns each strength into an unclear gap that quotes its CV line, with importance from the ad", () => {
    const stronger = strongerGaps(job, {
      ...match,
      strengths: [...match.strengths, { requirement: "Healthcare or NHS data", evidence: "Analysed A&E waiting times for my MSc" }],
    }, profile);
    expect(stronger.map(({ requirement, importance, kind }) => [requirement, importance, kind])).toEqual([
      ["Strong SQL", "essential", "unclear"],
      ["Python or R for analysis", "essential", "unclear"],
      ["Dashboards in Power BI or Tableau", "essential", "unclear"],
      ["Healthcare or NHS data", "desirable", "unclear"],
    ]);
    expect(stronger[0].detail).toBe('Already shown by: "Cleaned and joined weekly sales data from 120 stores using SQL and Python"');
  });

  it("sends no strengths when there are five gaps or more, since none could be asked about", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => gap(id, `Requirement ${id}`));
    expect(strongerGaps(job, { ...match, gaps: five }, profile)).toEqual([]);
    expect(strongerGaps(job, { ...match, gaps: five.slice(1) }, profile)).not.toEqual([]);
  });

  it("gives a strength the same short id whatever its spelling, so stored questions still find it", () => {
    const [first] = strongerGaps(job, match, profile);
    const [again] = strongerGaps(job, { ...match, strengths: [{ requirement: "  strong   SQL. ", evidence: "Another line" }] }, profile);
    expect(first.id).toMatch(/^stronger-[0-9a-f]{8}$/);
    expect(again.id).toBe(first.id);
    expect(strongerGaps(job, { ...match, strengths: [{ requirement: "Strong Python", evidence: "x" }] }, profile)[0].id).not.toBe(first.id);
  });

  it("leaves out job conditions, strengths already asked about as gaps, and repeats", () => {
    const stronger = strongerGaps(job, {
      ...match,
      strengths: [
        { requirement: "Full UK driving licence", evidence: "Full UK driving licence" },
        { requirement: "Power BI", evidence: "Skills: Power BI" },
        { requirement: "Strong SQL", evidence: "Skills: SQL" },
        { requirement: "strong sql", evidence: "SQL again" },
      ],
    }, profile);
    expect(stronger.map((gap) => gap.requirement)).toEqual(["Strong SQL"]);
  });

  it("lists the match's gaps first, then the strengths", () => {
    expect(questionGaps(job, match, profile).map((gap) => gap.id.replace(/-[0-9a-f]{8}$/, ""))).toEqual(["sara-gap-1", "sara-gap-2", "sara-gap-3", "stronger", "stronger", "stronger"]);
  });

  const a = (id: string, importance: Gap["importance"] = "essential") => ({ ...gap(id, `Requirement ${id}`), importance });
  const asked = (...ids: string[]): GapQuestion[] => ids.map((gapId) => ({ gapId, question: `About ${gapId}?` }));

  it("fills up to five with strength questions, essentials first", () => {
    const gaps = [a("a1"), a("a2", "desirable")];
    const stronger = [a("b1", "desirable"), a("b2"), a("b3"), a("b4"), a("b5")];
    const picked = pickQuestions(asked("b1", "b2", "b3", "b4", "b5", "a2", "a1"), gaps, stronger);
    expect(picked.map((item) => item.gapId)).toEqual(["a1", "a2", "b2", "b3", "b4"]);
  });

  it("never cuts a gap's question to make room, and adds no strength questions past five", () => {
    const gaps = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => a(id));
    const picked = pickQuestions(asked("a1", "a2", "a3", "a4", "a5", "a6", "b1"), gaps, [a("b1")]);
    expect(picked.map((item) => item.gapId)).toEqual(["a1", "a2", "a3", "a4", "a5", "a6"]);
  });

  it("drops questions about unknown gaps and keeps one per gap", () => {
    const picked = pickQuestions([...asked("x", "a1", "b1"), { gapId: "a1", question: "Again?" }], [a("a1")], [a("b1")]);
    expect(picked).toEqual(asked("a1", "b1"));
  });

  it("sends the strengths to the model in their own section of the prompt", async () => {
    const prompt = await gapQuestionsPrompt({ profile, job, gaps: skillGaps(match.gaps), stronger: strongerGaps(job, match, profile) });
    expect(prompt.indexOf("## Make it stronger")).toBeGreaterThan(prompt.indexOf("## The gaps"));
    expect(prompt.slice(prompt.indexOf("## Make it stronger"))).toContain(`"id": "${strongerGaps(job, match, profile)[0].id}"`);
  });

  it("in mock mode, still asks only about the match's gaps", async () => {
    const questions = await askGapQuestions({ profile, job, match });
    expect(questions.map((item) => item.gapId)).toEqual(["sara-gap-1", "sara-gap-2", "sara-gap-3"]);
  });
});
