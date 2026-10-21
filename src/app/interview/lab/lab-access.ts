/**
 * The lab is a developer page that can spend API credit, so it runs only in development, on Vercel preview
 * deployments, or where INTERVIEW_LAB=on is set; never on the production deployment.
 */
export function isLabEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" || process.env.INTERVIEW_LAB === "on";
}
