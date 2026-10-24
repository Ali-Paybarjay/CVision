// Where Tailor reads the signed-in user's Profile, jobs and match: Shayan's server reads (#93, #94), which give
// sample data when nobody is signed in or Supabase is not connected.
export { getMyDataSource, getMyJob, getMyMatch, getMyProfile, listMyJobs, type DataSource } from "@/features/profile/my-data";
