// Pages shown in the top menu. Each owner adds their page here once it exists.
export const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  // "Check a job", as the page title and the path steps say: a pilot read "Jobs" as a job search (8 November).
  { href: "/jobs", label: "Check a job" },
  { href: "/tailor", label: "Tailor" },
  { href: "/cv-check", label: "CV check" },
  { href: "/interview", label: "Interview" },
] as const;

// Pages linked from the footer on every page.
export const footerItems = [{ href: "/privacy", label: "Privacy" }] as const;
