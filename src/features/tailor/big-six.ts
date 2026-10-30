// The six main skills a tailored CV lists: broad abilities such as Communication, never software or tools,
// which go under "Skills and tools". Layout and families from docs/tailor-templates. Pure code.

export const bigSixTarget = 6;

/** The only names a main skill can have, so a tool can never reach the list. */
export const bigSixSkills = [
  "Adaptability",
  "Analytical thinking",
  "Attention to detail",
  "Coaching",
  "Collaboration",
  "Communication",
  "Creativity",
  "Critical thinking",
  "Customer service",
  "Decision making",
  "Initiative",
  "Leadership",
  "Management",
  "Mentoring",
  "Negotiation",
  "Networking",
  "Organisation",
  "Planning",
  "Presentation",
  "Problem solving",
  "Stakeholder management",
  "Teamwork",
  "Time management",
] as const;

/** Action verbs for CV lines, from the template's skills list in UK spelling. */
export const actionVerbs = [
  "Adapted", "Combined", "Composed", "Conceptualised", "Created", "Customised", "Designed", "Developed", "Enhanced", "Established",
  "Formulated", "Founded", "Illustrated", "Initiated", "Integrated", "Introduced", "Invented", "Modified", "Originated", "Planned",
  "Revised", "Revitalised", "Shaped", "Solved", "Administered", "Advocated", "Analysed", "Arranged", "Assessed", "Assigned", "Chaired",
  "Clarified", "Coached", "Collaborated", "Consolidated", "Coordinated", "Delegated", "Diagnosed", "Directed", "Evaluated", "Facilitated",
  "Generated", "Guided", "Headed", "Improved", "Increased", "Led", "Managed", "Mentored", "Motivated", "Organised", "Oversaw",
  "Prioritised", "Resolved", "Simplified", "Streamlined", "Supervised",
];

function key(skill: string): string {
  return skill.trim().toLowerCase().replace(/[-\s]+/g, " ").replace(/^team work$/, "teamwork");
}

/** True for a main skill such as "Communication"; false for a tool or anything else. */
export function isBigSix(skill: string): boolean {
  return bigSixSkills.some((name) => key(name) === key(skill));
}
