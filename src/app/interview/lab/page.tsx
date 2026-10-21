import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAiMode } from "@/shared/ai";
import { personas } from "@/shared/sample-data";
import { jobRequirementsText, jobToText, profileToCvText } from "@/features/interview/engine/text";
import { fixtures } from "@/features/interview/fixtures";
import { InterviewLab } from "./interview-lab";
import { isLabEnabled } from "./lab-access";
import type { LabSource } from "./lab-types";

export const metadata: Metadata = {
  title: "Interview practice lab",
  robots: { index: false, follow: false },
};

// The fixtures, then the other sample-data personas (Sara is already a fixture). Personas run in live mode only.
function labSources(): LabSource[] {
  const fromFixtures = fixtures.map((fixture) => ({
    id: fixture.id,
    label: fixture.label,
    description: fixture.description,
    kind: "fixture" as const,
    inputs: {
      jobId: fixture.job.id,
      jobDescription: jobToText(fixture.job),
      cv: profileToCvText(fixture.profile),
      parsedRequirements: jobRequirementsText(fixture.job),
    },
    samples: Object.fromEntries(Object.entries(fixture.answers).map(([id, answer]) => [id, { main: answer.main, followUp: answer.followUp }])),
  }));
  const fromPersonas = (["reza", "emma", "daniel"] as const).map((name) => {
    const { profile, jobs } = personas[name];
    return {
      id: `persona-${name}`,
      label: `${jobs[0].title} · ${profile.fullName} (sample data)`,
      description: profile.summary,
      kind: "persona" as const,
      inputs: {
        jobId: jobs[0].id,
        jobDescription: jobToText(jobs[0]),
        cv: profileToCvText(profile),
        parsedRequirements: jobRequirementsText(jobs[0]),
      },
      samples: {},
    };
  });
  return [...fromFixtures, ...fromPersonas];
}

/** Developer page for the interview engine. Not in the menu, and absent from the production deployment (see isLabEnabled). */
export default function InterviewLabPage() {
  if (!isLabEnabled()) notFound();
  return <InterviewLab mode={getAiMode()} sources={labSources()} />;
}
