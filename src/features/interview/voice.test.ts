// The feedback follows prompts/_voice.md: UK English, no generic praise or advice, one specific thing to do next.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/shared/ai";
import { addAnswer, applyFollowUpDecision, askQuestion } from "./engine/session";
import { analyseStep, evaluateAnswer, generateStep, reviewStep } from "./engine/stages";
import { evaluationProblems, genericFeedbackHits, reportProblems, usSpellingHits } from "./engine/checks";
import { fixtures } from "./fixtures";
import { dataAnalystSara } from "./fixtures/data-analyst-sara";
import { processEngineer } from "./fixtures/process-engineer";
import { inputsFor } from "./test-support";

const sample = processEngineer.answers.q1;
const context = { lookForIds: ["q1-l1", "q1-l2", "q1-l3", "q1-l4"], mainAnswer: sample.main, followUpAnswer: null, followUpAsked: false };
const messages = (evaluation: typeof sample.evaluation) => evaluationProblems(evaluation, context).map((p) => p.message);

describe("voice helpers", () => {
  it("finds US spellings as whole words only", () => {
    expect(usSpellingHits("We analyzed the color of the data.")).toEqual(["color", "analyzed"]);
    expect(usSpellingHits("The organisation analysed the colour, and the centre ran a program.")).toEqual([]);
    expect(usSpellingHits("A recolored chart")).toEqual([]);
  });

  it("leaves US spellings that the feedback quotes", () => {
    expect(usSpellingHits('You said "I optimized the pipeline" but gave no figure.')).toEqual([]);
    expect(usSpellingHits("You said “I optimized the pipeline” but gave no figure.")).toEqual([]);
    expect(usSpellingHits("For a Data Center Technician role, name the cooling standard.", "Data Center Technician")).toEqual([]);
    expect(usSpellingHits("For a Data Center Technician role, analyze the cooling.", "Data Center Technician")).toEqual(["analyze"]);
  });

  it("finds generic praise and advice", () => {
    expect(genericFeedbackHits("Great answer! Keep practising.")).toEqual(["great answer", "keep practising"]);
    expect(genericFeedbackHits("You named the reconciliation step and why it comes first.")).toEqual([]);
  });
});

describe("answer feedback", () => {
  it("passes for the fixtures' sample evaluations", () => {
    expect(messages(sample.evaluation)).toEqual([]);
  });

  it("rejects US spelling", () => {
    expect(messages({ ...sample.evaluation, weaknesses: ["You did not analyze the root cause."] })).toContain("Use UK spelling in the feedback.");
  });

  it("accepts US spelling quoted from the answer or the role title", () => {
    const withQuote = { ...sample.evaluation, weaknesses: ["You said you optimized the loop but gave no figure."] };
    const quoting = { ...context, mainAnswer: `${sample.main} I optimized the loop.` };
    expect(evaluationProblems(withQuote, quoting).map((p) => p.message)).not.toContain("Use UK spelling in the feedback.");
    const centre = { ...sample.evaluation, strengths: ["You named the cooling checks a Data Center Technician runs first."] };
    expect(evaluationProblems(centre, { ...context, quotable: "Data Center Technician" }).map((p) => p.message)).not.toContain(
      "Use UK spelling in the feedback.",
    );
  });

  it("does not end a sentence at e.g., i.e. or etc.", () => {
    const one = "Open with the governing check, e.g. vibration, then give the figure you designed to. Say who signed it off.";
    expect(messages({ ...sample.evaluation, improvement: one })).not.toContain("Give one specific action in at most 3 sentences and 60 words.");
  });

  it("rejects praise or advice that fits any answer", () => {
    expect(messages({ ...sample.evaluation, strengths: ["Great answer overall."] })).toContain(
      "Feedback must be specific to this answer: no generic praise or advice.",
    );
    expect(messages({ ...sample.evaluation, improvement: "Be more confident." })).toContain(
      "Feedback must be specific to this answer: no generic praise or advice.",
    );
  });

  it("allows three short sentences in the improvement", () => {
    const three =
      "Open with the tie component: the feed holds 800 kg/h of dry solids. Work the product mass from those 800 kg/h, then take the difference. Rehearse this aloud tonight.";
    expect(messages({ ...sample.evaluation, improvement: three })).not.toContain("Give one specific action in at most 3 sentences and 60 words.");
  });

  it("keeps the improvement to one specific action", () => {
    const list = "Name the alarm. Say who you told. Give the figure. Explain the fix.";
    expect(messages({ ...sample.evaluation, improvement: list })).toContain("Give one specific action in at most 3 sentences and 60 words.");
    expect(messages({ ...sample.evaluation, improvement: "word ".repeat(61).trim() + "." })).toContain(
      "Give one specific action in at most 3 sentences and 60 words.",
    );
  });

  it.each(fixtures.flatMap((f) => Object.entries(f.answers).map(([id, a]) => [`${f.id} ${id}`, a.evaluation] as const)))(
    "%s: strengths, weaknesses and one improvement are present",
    (_, evaluation) => {
      expect(evaluation.weaknesses.length).toBeGreaterThanOrEqual(1);
      expect(evaluation.improvement.trim()).not.toBe("");
      expect(usSpellingHits([...evaluation.strengths, ...evaluation.weaknesses, evaluation.improvement].join("\n"))).toEqual([]);
    },
  );
});

describe("report", () => {
  const report = processEngineer.report;
  const reportContext = { levelGap: report.levelGapNote !== null, lowConfidenceIds: report.uncertaintyNotes.map((n) => n.questionId) };

  it("passes for the fixture's report", () => {
    expect(reportProblems(report, reportContext)).toEqual([]);
  });

  it("never puts redundant in a priority title", () => {
    const priorities = [{ title: "Explain why you were made redundant", detail: report.priorities[0].detail }, ...report.priorities.slice(1)];
    expect(reportProblems({ ...report, priorities }, reportContext).map((p) => p.message)).toContain('Never use "redundant" in a priority title.');
  });

  it("rejects generic priorities and US spelling", () => {
    const priorities = [{ title: "Keep practising", detail: "Prioritize your answers." }, ...report.priorities.slice(1)];
    const found = reportProblems({ ...report, priorities }, reportContext).map((p) => p.message);
    expect(found).toContain("Priorities must be specific to this job and these answers: no generic advice.");
    expect(found).toContain("Use UK spelling in the report.");
  });

  it("accepts a US spelling the role or an answer uses", () => {
    const verdict = `${report.verdict} Your Data Center experience shows.`;
    expect(reportProblems({ ...report, verdict }, reportContext).map((p) => p.message)).toContain("Use UK spelling in the report.");
    expect(reportProblems({ ...report, verdict }, { ...reportContext, quotable: '{"title":"Data Center Technician"}' })).toEqual([]);
  });
});

describe("evaluate stage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts US spelling quoted from a tool or standard the job ad names", async () => {
    const inputs = inputsFor(dataAnalystSara);
    let session = await analyseStep(inputs, { id: "s1", startedAt: "2026-10-21T09:00:00.000Z" });
    session = await generateStep(session, inputs);
    session = await reviewStep(session, inputs);
    session = { ...session, roleProfile: { ...session.roleProfile!, namedItems: [{ text: "Data Center Monitor", kind: "tool" }] } };
    session = askQuestion(session, "q3", "2026-10-21T09:01:00.000Z", "t1");
    session = addAnswer(session, { questionId: "q3", kind: "main", text: "A plain answer.", startedAt: "2026-10-21T09:01:00.000Z", submittedAt: "2026-10-21T09:02:00.000Z", id: "t2" });
    session = applyFollowUpDecision(session, { questionId: "q3", askFollowUp: false, gapType: "none", usedFallback: false, reason: "Clear enough." }, "2026-10-21T09:03:00.000Z", "t3");
    const spy = vi.spyOn(ai, "askModel");
    await evaluateAnswer(session, "q3");

    const { schema, sample } = spy.mock.calls.at(-1)![0];
    const output = { ...(sample as object), weaknesses: ["You did not say which Data Center Monitor alert you would check first."] };
    expect(schema.safeParse(output).success).toBe(true);
  });
});
