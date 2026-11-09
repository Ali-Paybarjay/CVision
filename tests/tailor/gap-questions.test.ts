import { describe, expect, it } from "vitest";
import { askGapQuestions, gapQuestionsPrompt, pickQuestions, questionGaps, skillGaps, strongerGaps } from "@/features/tailor";
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

describe("a degree the CV already shows is never asked about", () => {
  const of = (kind: Gap["kind"], requirement: string): Gap => ({ ...gap("d", requirement), kind });

  it.each([
    "Accredited degree in Chemical/Environmental or Process Engineering",
    "IChemE-accredited BEng or MEng in Chemical Engineering",
    "A degree in engineering or a related subject",
    "MSc in Data Science or equivalent",
  ])("asks nothing when %s is only unclear", (requirement) => {
    expect(skillGaps([of("unclear", requirement)])).toEqual([]);
  });

  it("still asks when the CV shows no degree at all", () => {
    expect(skillGaps([of("missing", "Accredited degree in Chemical Engineering")])).toHaveLength(1);
  });

  it("still asks about degree-level knowledge, which is about knowledge, not a degree", () => {
    expect(skillGaps([of("unclear", "Degree-level knowledge of statistics")])).toHaveLength(1);
  });

  it("never turns a degree the CV meets into a Make it stronger question", () => {
    const { jobs, match } = personas.sara;
    const strengths = [
      { requirement: "Accredited degree in Chemical Engineering", evidence: "BSc Chemical Engineering, Harrowgate University" },
      { requirement: "Strong SQL", evidence: "Skills: SQL" },
    ];
    expect(strongerGaps(jobs[0], { ...match, strengths }).map((item) => item.requirement)).toEqual(["Strong SQL"]);
  });

  it("tells the model never to ask whether a degree is accredited", async () => {
    const { profile, jobs, match } = personas.sara;
    const prompt = await gapQuestionsPrompt({ profile, job: jobs[0], gaps: match.gaps });
    expect(prompt).toContain("Never ask whether a degree is accredited, recognised or equivalent");
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
    });
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
    expect(strongerGaps(job, { ...match, gaps: five })).toEqual([]);
    expect(strongerGaps(job, { ...match, gaps: five.slice(1) })).not.toEqual([]);
  });

  it("gives a strength the same short id whatever its spelling, so stored questions still find it", () => {
    const [first] = strongerGaps(job, match);
    const [again] = strongerGaps(job, { ...match, strengths: [{ requirement: "  strong   SQL. ", evidence: "Another line" }] });
    expect(first.id).toMatch(/^stronger-[0-9a-f]{8}$/);
    expect(again.id).toBe(first.id);
    expect(strongerGaps(job, { ...match, strengths: [{ requirement: "Strong Python", evidence: "x" }] })[0].id).not.toBe(first.id);
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
    });
    expect(stronger.map((gap) => gap.requirement)).toEqual(["Strong SQL"]);
  });

  it("lists the match's gaps first, then the strengths", () => {
    expect(questionGaps(job, match).map((gap) => gap.id.replace(/-[0-9a-f]{8}$/, ""))).toEqual(["sara-gap-1", "sara-gap-2", "sara-gap-3", "stronger", "stronger", "stronger"]);
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
    const prompt = await gapQuestionsPrompt({ profile, job, gaps: skillGaps(match.gaps), stronger: strongerGaps(job, match) });
    expect(prompt.indexOf("## Make it stronger")).toBeGreaterThan(prompt.indexOf("## The gaps"));
    expect(prompt.slice(prompt.indexOf("## Make it stronger"))).toContain(`"id": "${strongerGaps(job, match)[0].id}"`);
  });

  it("in mock mode, still asks only about the match's gaps", async () => {
    const questions = await askGapQuestions({ profile, job, match });
    expect(questions.map((item) => item.gapId)).toEqual(["sara-gap-1", "sara-gap-2", "sara-gap-3"]);
  });
});
