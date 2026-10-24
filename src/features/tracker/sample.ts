import { ApplicationSchema } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import type { TrackedApplication } from "./model";

// Sara's tracker, shown until Supabase is connected. Her first job is an interview fixture, so the
// interview link opens practice in mock mode too.
const [interviewJob, appliedJob] = personas.sara.jobs;

export const sampleApplications: TrackedApplication[] = [
  {
    application: ApplicationSchema.parse({
      id: "sara-application-1",
      jobId: interviewJob.id,
      date: "2026-10-20",
      status: "interview",
      nextStep: "Practise the interview questions before Thursday",
    }),
    job: { title: interviewJob.title, company: interviewJob.company },
  },
  {
    application: ApplicationSchema.parse({
      id: "sara-application-2",
      jobId: appliedJob.id,
      date: "2026-10-16",
      status: "applied",
      nextStep: "Email the recruiter if there is no reply by 30 October",
    }),
    job: { title: appliedJob.title, company: appliedJob.company },
  },
];
