// Pages shown in the top menu. Each owner adds their page here once it exists.
export const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  // "Check a job", as the page title and the path steps say: a pilot read "Jobs" as a job search (8 November).
  { href: "/jobs", label: "Check a job" },
  { href: "/tailor", label: "Tailor" },
  { href: "/interview", label: "Interview" },
  // The free CV check is the way in for visitors. A signed-in user reaches it from Profile and the dashboard, so the
  // menu keeps only their path (profile, job ad, tailored CV, interview) and two "check" pages don't sit side by side.
  { href: "/cv-check", label: "CV check", visitorOnly: true },
] as const;

// Pages linked from the footer on every page.
export const footerItems = [{ href: "/privacy", label: "Privacy" }] as const;

/**
 * Where "Tailor my CV to a job" sends a signed-out visitor: sign-up, then their profile, also from the confirmation
 * email (#507). It is withNext("/sign-up", "/profile") written out, because @/shared reads nothing from @/features.
 */
export const signUpThenProfile = "/sign-up?next=%2Fprofile";
