// Every table that holds a user's rows (issue #43), in the order the app lists them. Kept apart from data-rights.ts,
// which is server only, so the database test (supabase/tests/account-deletion.test.ts) can check this list against
// the schema: a new table with a user_id fails that test until it is added here, to the summary, the download and
// the deletion.

/**
 * Every public table with a user_id. Deleting the user from auth.users deletes their rows in all of them
 * (on delete cascade).
 */
export const userTables = [
  "profiles",
  "jobs",
  "match_results",
  "tailoring_changes",
  "interview_sessions",
  "applications",
  "events",
  "ai_usage",
] as const;
export type UserTable = (typeof userTables)[number];

/** The tables closed to browsers: only the server's secret key reads or writes them. The rest are the user's own. */
export const serverOnlyTables: readonly UserTable[] = ["events", "ai_usage"];
