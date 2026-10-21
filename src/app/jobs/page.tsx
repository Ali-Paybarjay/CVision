import type { Metadata } from "next";
import { getAiMode } from "@/shared/ai";
import { Page } from "@/shared/ui";
import { JobChecker } from "@/features/profile/ui/job-checker";

export const metadata: Metadata = {
  title: "Check a job ad",
};

/** Two model requests per check (reading the ad, then the match), each of which may be asked twice. */
export const maxDuration = 120;

export default function JobsPage() {
  return (
    <Page
      title="Check a job ad"
      description="Paste a job ad. We find what the employer is asking for, and where your experience already matches."
    >
      <JobChecker demoMode={getAiMode() === "mock"} />
    </Page>
  );
}
