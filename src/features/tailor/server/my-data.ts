// Where Tailor reads the signed-in user's Profile, jobs and match. Sample data for now; once Shayan's
// server reads are merged (#48), change only this line to import them from src/features/profile.
export { getMyDataSource, getMyJob, getMyMatch, getMyProfile, listMyJobs, type DataSource } from "./sample-my-data";
