// Helpers for the interview tests: the text a fixture's prompts see, and a full mock session run through the engine.
import type { InterviewSession } from "./contracts";
import type { QuestionSetContext } from "./engine/checks";
import type { InterviewInputs } from "./engine/schemas";
import { addAnswer, applyEvaluation, applyFollowUpDecision, applyReport, askQuestion } from "./engine/session";
import { analyseStep, decideFollowUp, evaluateAnswer, generateStep, reviewStep, writeReport } from "./engine/stages";
import { jobRequirementsText, jobToText, profileToCvText } from "./engine/text";
import type { InterviewFixture } from "./fixtures/types";

export function inputsFor(fixture: InterviewFixture): InterviewInputs {
  return {
    jobId: fixture.job.id,
    jobDescription: jobToText(fixture.job),
    cv: profileToCvText(fixture.profile),
    parsedRequirements: jobRequirementsText(fixture.job),
  };
}

export function questionSetContextFor(fixture: InterviewFixture): QuestionSetContext {
  const inputs = inputsFor(fixture);
  return {
    roleProfile: fixture.analyse.roleProfile,
    candidateProfile: fixture.analyse.candidateProfile,
    jobDescription: inputs.jobDescription,
    cv: inputs.cv,
    count: 6,
  };
}

let counter = 0;
const nextId = () => `t${++counter}`;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 21, 9, minute)).toISOString();

/** Runs a whole session in mock mode with the fixture's sample answers, through the same functions the page uses. */
export async function runMockSession(fixture: InterviewFixture, answer?: (questionId: string) => { main: string; followUp: string }): Promise<InterviewSession> {
  const inputs = inputsFor(fixture);
  let session = await analyseStep(inputs, { id: `session-${fixture.id}`, startedAt: at(0) });
  session = await generateStep(session, inputs);
  session = await reviewStep(session, inputs);

  let minute = 1;
  for (const question of session.questions) {
    const sample = fixture.answers[question.id];
    const text = answer ? answer(question.id) : { main: sample.main, followUp: sample.followUp ?? "" };
    session = askQuestion(session, question.id, at(minute++), nextId());
    session = addAnswer(session, { questionId: question.id, kind: "main", text: text.main, startedAt: at(minute), submittedAt: at(minute + 3), id: nextId() });
    minute += 4;
    const { decision, usage, provenance } = await decideFollowUp(session, question.id);
    session = applyFollowUpDecision(session, decision, at(minute), nextId(), usage, provenance);
    if (decision.askFollowUp) {
      session = addAnswer(session, { questionId: question.id, kind: "follow-up", text: text.followUp, startedAt: at(minute), submittedAt: at(minute + 2), id: nextId() });
      minute += 3;
    }
    const scored = await evaluateAnswer(session, question.id);
    session = applyEvaluation(session, scored.evaluation, scored.usage, scored.provenance);
  }
  const { report, usage, provenance } = await writeReport(session);
  return applyReport(session, report, usage, provenance);
}
