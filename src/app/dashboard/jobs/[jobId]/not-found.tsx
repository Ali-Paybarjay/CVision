import { JobAdNotFound } from "@/features/tracker/job-ad";

// A job that is missing or belongs to someone else (JobAd calls notFound()).
export default function NotFound() {
  return <JobAdNotFound />;
}
