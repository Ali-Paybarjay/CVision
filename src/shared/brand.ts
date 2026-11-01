// The product name and core brand copy live only here (docs/brand.md).
// CVision is a working name: if it changes, change it here and in docs/brand.md.
export const brand = {
  name: "CVision",
  /** In the footer and the search description. The home page leads with `hero` instead (#178). */
  tagline: "Every application, made to fit.",
  /** The home page's first words, chosen by team vote in #178: the pain first, then what CVision does about it. */
  hero: {
    headline: "Stop rewriting your CV for every job.",
    subline:
      "Paste a job ad. We tailor your CV to it and write your cover letter in minutes, from your own experience. You approve every change.",
  },
  /** The team's shared address for data rights and feedback (#134). Never a teammate's own email. */
  contactEmail: "cvision.team.uk@gmail.com",
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
  /**
   * Each button says what you get. One action has one name everywhere (header, home page, dashboard, CV check).
   * "Free" stays out of the button labels and lives in the small line under them.
   */
  cta: {
    primary: "Tailor my CV to a job",
    /** Under the primary button: works for people with a CV and for those who fill in their details instead. */
    primaryNote: "Free account. Add your CV or your details, then paste a job ad.",
    /** The feature's name, e.g. the CV check page's title. */
    cvCheck: "Free 2-minute CV check",
    /** The button that leads to the CV check. */
    cvCheckAction: "Check my CV in 2 minutes",
    cvCheckNote: "No sign-up. Nothing is saved.",
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
