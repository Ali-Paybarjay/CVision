import type { InterviewInputs } from "@/features/interview/engine/schemas";

/** Something the lab can run an interview on: a fixture, or a sample-data persona (live mode only). */
export type LabSource = {
  id: string;
  label: string;
  description: string;
  kind: "fixture" | "persona";
  inputs: InterviewInputs;
  /** Fixture sample answers by question id, for one-click answers in mock mode. */
  samples: Record<string, { main: string; followUp: string | null }>;
};
