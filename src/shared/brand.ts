// The product name and core brand copy live only here (docs/brand.md).
// CVision is a working name: if it changes, change it here and in docs/brand.md.
export const brand = {
  name: "CVision",
  tagline: "Every application, made to fit.",
  oneLiner:
    "We help anyone applying for a job in the UK turn any job ad into a tailored CV and cover letter in minutes, so they can get interviews.",
  /** The plan: three steps, one outcome. */
  steps: [
    {
      title: "Build your profile.",
      detail: "Upload your CV or fill in your details. Everything we write comes from your profile and from what you tell us.",
    },
    {
      title: "Paste a job ad.",
      detail: "We find what the employer is asking for, and where your experience already matches.",
    },
    {
      title: "Get a tailored CV and cover letter.",
      detail: "Every change is highlighted, so you can check it before you download.",
    },
  ],
  motto: "Paste. Tailor. Apply.",
  /** Proof of competence: the brand is the guide, never the hero. */
  proof: "Every line in your CV traces back to something you told us. Nothing invented.",
  cta: {
    primary: "Get started free",
    cvCheck: "Free 2-minute CV check",
    cvCheckQuestion: "Is your CV ready for UK employers?",
  },
  /** Our Honest CV Promise: four promises we keep. */
  promise: {
    title: "Our Honest CV Promise",
    items: [
      {
        title: "Nothing invented",
        text: "We never invent experience you don't have. Every claim comes from your CV and what you tell us.",
      },
      { title: "You approve everything", text: "You review and approve everything. We never apply on your behalf." },
      { title: "Your data is yours", text: "Download or delete it any time." },
      { title: "Sounds like you", text: "We write from your own words, so it sounds like you, not a template." },
    ],
  },
  /** The home page's real product example: a fictional persona's CV with the lines CVision tailored. */
  example: {
    label: (name: string) => `${name}'s CV, tailored`,
    evidenceIntro: (firstName: string) => `${firstName}'s own answer to a follow-up question:`,
    caption: (name: string, job: string, company: string) =>
      `${name} is a fictional example. The highlighted lines were tailored for the ${job} job at ${company}.`,
  },
  /** Never write these anywhere: app copy, AI output, invitations or slides. */
  bannedPhrases: ["guaranteed", "dream job", "beat the bots", "hack the ATS", "revolutionary", "10x", "effortless"],
} as const;
