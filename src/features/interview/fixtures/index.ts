// The three interview fixtures. In mock mode they are the only jobs a session can run on.
import { dataAnalystSara } from "./data-analyst-sara";
import { managementAccountant } from "./management-accountant";
import { processEngineer } from "./process-engineer";
import type { InterviewFixture } from "./types";

export const fixtures: InterviewFixture[] = [processEngineer, dataAnalystSara, managementAccountant];

export function fixtureForJob(jobId: string): InterviewFixture | undefined {
  return fixtures.find((fixture) => fixture.job.id === jobId);
}

export function fixtureById(id: string): InterviewFixture | undefined {
  return fixtures.find((fixture) => fixture.id === id);
}
