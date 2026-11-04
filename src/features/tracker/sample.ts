import { ApplicationSchema, type Job } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { addDays, daysBetween, type JobSummary, type TrackedApplication } from "./model";

// Sara's tracker, shown until Supabase is connected. Her first job is an interview fixture, so the
// interview link opens practice in mock mode too. Her two sample jobs have a full ad to open; the other four
// jobs are fictional, like Sara, and have only a title.
const [interviewJob, appliedJob] = personas.sara.jobs;

const summary = (job: Job): JobSummary => ({ title: job.title, company: job.company, deadline: job.deadline });

/** The day the dates below are written for. */
const writtenOn = "2026-10-25";

/**
 * Sara's sample applications as on 25 October 2026: one at interview, one applied 9 days ago, one ready with
 * 5 days to its closing date, two applied with no news for over 60 days, and one unsuccessful. The interview's next
 * step is due tomorrow and the applied one's is overdue, so the dashboard always shows both.
 */
export const sampleApplications: TrackedApplication[] = [
  {
    application: ApplicationSchema.parse({
      id: "sara-application-1",
      jobId: interviewJob.id,
      date: "2026-10-20",
      status: "interview",
      nextStep: "Prepare for the interview questions",
      nextStepDate: "2026-10-26",
    }),
    job: summary(interviewJob),
    hasAd: true,
  },
  {
    application: ApplicationSchema.parse({
      id: "sara-application-2",
      jobId: "sara-sample-job-3",
      date: "2026-10-23",
      status: "ready",
      nextStep: "Check the tailored CV, then apply on the employer's site",
    }),
    job: { title: "Reporting Analyst", company: "Medlock Housing Partnership", deadline: "2026-10-30" },
  },
  {
    application: ApplicationSchema.parse({
      id: "sara-application-3",
      jobId: appliedJob.id,
      date: "2026-10-16",
      status: "applied",
      nextStep: "Email the recruiter if there is no reply yet",
      nextStepDate: "2026-10-23",
    }),
    job: summary(appliedJob),
    hasAd: true,
  },
  {
    application: ApplicationSchema.parse({
      id: "sara-application-4",
      jobId: "sara-sample-job-4",
      date: "2026-10-09",
      status: "rejected",
      nextStep: "Ask for feedback on the written test",
    }),
    job: { title: "Graduate Insight Analyst", company: "Bollin Retail Group" },
  },
  {
    application: ApplicationSchema.parse({
      id: "sara-application-5",
      jobId: "sara-sample-job-5",
      date: "2026-08-24",
      status: "applied",
      nextStep: null,
    }),
    job: { title: "Junior Business Analyst", company: "Irk Valley Foods" },
  },
  {
    application: ApplicationSchema.parse({
      id: "sara-application-6",
      jobId: "sara-sample-job-6",
      date: "2026-08-21",
      status: "applied",
      nextStep: null,
    }),
    job: { title: "Data Analyst", company: "Etherow Freight" },
  },
];

/**
 * Sara's sample as it looks today: every date moves by the days since 25 October 2026, so the dashboard always
 * shows the same picture (days without news, a closing date this week, rows to close).
 */
export function sampleApplicationsOn(today: string): TrackedApplication[] {
  const shift = daysBetween(writtenOn, today);
  return sampleApplications.map(({ application, job, ...rest }) => ({
    ...rest,
    application: {
      ...application,
      date: addDays(application.date, shift),
      ...(application.nextStepDate ? { nextStepDate: addDays(application.nextStepDate, shift) } : {}),
    },
    job: job && { ...job, deadline: job.deadline && addDays(job.deadline, shift) },
  }));
}
