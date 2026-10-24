// Pages shown in the top menu. Each owner adds their page here once it exists.
export const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/jobs", label: "Jobs" },
  { href: "/tailor", label: "Tailor" },
  { href: "/cv-check", label: "CV check" },
  { href: "/interview", label: "Interview" },
] as const;

// Pages linked from the footer on every page.
export const footerItems = [{ href: "/privacy", label: "Privacy" }] as const;
