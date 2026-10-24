// Where interview practice reads the signed-in user's Profile and jobs: Shayan's server reads (#48). Signed out or
// without Supabase, they answer with a sample persona, so the page still works.
export { getMyJob, getMyProfile, listMyJobs } from "@/features/profile/my-data";
