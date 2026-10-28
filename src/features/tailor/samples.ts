// Fictional answers to the gap questions, and the proposal each persona should get.
// They are the mock answers for askModel and the test data until real answers arrive.
import { personas, type PersonaName } from "@/shared/sample-data";
import { defaultGapQuestion } from "./gap-questions";
import type { GapAnswer, Proposal } from "./types";

function answer(name: PersonaName, gapId: string, text: string, hasExperience: boolean): GapAnswer {
  const gap = personas[name].match.gaps.find((item) => item.id === gapId);
  if (!gap) throw new Error(`No gap ${gapId} for ${name}`);
  return { gapId, question: defaultGapQuestion(gap).question, answer: text, hasExperience };
}

export const sampleAnswers: Record<PersonaName, GapAnswer[]> = {
  sara: [
    answer(
      "sara",
      "sara-gap-1",
      "Every Monday I walked the regional managers through the dashboard on a call and wrote a one-page summary in plain English with the three things that changed that week.",
      true,
    ),
    answer("sara", "sara-gap-2", "No, I have only used Tableau.", false),
    answer("sara", "sara-gap-3", "I used Git and GitHub for my MSc dissertation code and committed after every analysis step.", true),
  ],
  reza: [
    answer(
      "reza",
      "reza-gap-1",
      "I built the Excel tracker for the year group's £15,000 trips budget, with a tab per trip and formulas that flagged overspends.",
      true,
    ),
    answer("reza", "reza-gap-2", "No, I have never used Asana or Jira.", false),
  ],
  emma: [
    answer("emma", "emma-gap-1", "I haven't written automated tests at work; the senior developers handled that.", false),
    answer(
      "emma",
      "emma-gap-2",
      "When I rebuilt the booking form I added labels to every field, fixed the tab order and checked it with a screen reader.",
      true,
    ),
    answer("emma", "emma-gap-3", "No, the agency didn't have a design system.", false),
  ],
  daniel: [
    answer(
      "daniel",
      "daniel-gap-1",
      "My four department managers each run their own team and I hold a weekly meeting with them; I don't manage all 45 staff directly day to day.",
      true,
    ),
    answer(
      "daniel",
      "daniel-gap-2",
      "I set up a weekly waste review with the fresh team, tracked the top ten lines and changed the order quantities. That is how we cut stock loss.",
      true,
    ),
    answer("daniel", "daniel-gap-3", "Only our stockroom and deliveries, never a warehouse.", false),
  ],
};

/**
 * The mock material for one gap of a sample job: the sample answer (to pre-fill the form) and the part of
 * the sample proposal for that gap. A job with no sample gives nothing, so mock mode suggests no change.
 */
export function sampleForGap(jobId: string, gapId: string): { answer: GapAnswer | null; proposal: Proposal } {
  const name = (Object.keys(personas) as PersonaName[]).find((key) => personas[key].match.jobId === jobId);
  if (!name) return { answer: null, proposal: { changes: [], nextSteps: [] } };
  return {
    answer: sampleAnswers[name].find((item) => item.gapId === gapId) ?? null,
    proposal: {
      changes: sampleProposals[name].changes.filter((change) => change.gapId === gapId),
      nextSteps: sampleProposals[name].nextSteps.filter((step) => step.gapId === gapId),
    },
  };
}

export const sampleProposals: Record<PersonaName, Proposal> = {
  sara: {
    changes: [
      {
        gapId: "sara-gap-1",
        section: "experience",
        before: "Built Tableau dashboards for the regional sales team",
        after:
          "Built Tableau dashboards for the regional sales team, walked the regional managers through them every Monday and wrote a one-page plain-English summary of the three things that changed that week",
        evidence:
          "Every Monday I walked the regional managers through the dashboard on a call and wrote a one-page summary in plain English with the three things that changed that week",
        evidenceSource: "follow-up-answer",
      },
      {
        gapId: "sara-gap-3",
        section: "skills",
        before: null,
        after: "Git and GitHub",
        evidence: "I used Git and GitHub for my MSc dissertation code",
        evidenceSource: "follow-up-answer",
      },
    ],
    nextSteps: [
      {
        gapId: "sara-gap-2",
        kind: "learn",
        suggestion:
          "Power BI works much like the Tableau you already use. Build one dashboard in the free Power BI Desktop, then add it to your CV.",
      },
    ],
  },
  reza: {
    changes: [
      {
        gapId: "reza-gap-1",
        section: "experience",
        before: "Managed the year group's £15,000 trips and activities budget",
        after:
          "Managed the year group's £15,000 trips and activities budget in an Excel tracker I built, with a tab per trip and formulas that flagged overspends",
        evidence:
          "I built the Excel tracker for the year group's £15,000 trips budget, with a tab per trip and formulas that flagged overspends",
        evidenceSource: "follow-up-answer",
      },
    ],
    nextSteps: [
      {
        gapId: "reza-gap-2",
        kind: "related-skill",
        suggestion:
          "You have not used Asana or Jira, but you coordinated a new timetable for 1,100 students and 80 staff. Both tools have free plans: plan one real piece of work in either before you add it.",
      },
    ],
  },
  emma: {
    changes: [
      {
        gapId: "emma-gap-2",
        section: "experience",
        before: "Rebuilt a client's booking form, reducing abandoned bookings by 18%",
        after:
          "Rebuilt a client's booking form, reducing abandoned bookings by 18%; added labels to every field, fixed the tab order and checked it with a screen reader",
        evidence: "I added labels to every field, fixed the tab order and checked it with a screen reader",
        evidenceSource: "follow-up-answer",
      },
    ],
    nextSteps: [
      {
        gapId: "emma-gap-1",
        kind: "learn",
        suggestion:
          "Automated testing is essential for this role. Add tests with Vitest and React Testing Library to one of your own React projects, then list it on your CV with a link.",
      },
      {
        gapId: "emma-gap-3",
        kind: "related-skill",
        suggestion:
          "You turn Figma designs into responsive pages. That is the closest real match to design systems work, so the cover letter can point to it.",
      },
    ],
  },
  daniel: {
    changes: [
      {
        gapId: "daniel-gap-1",
        section: "experience",
        before: "Run a store with 45 staff and a turnover of £9 million a year",
        after:
          "Run a store with 45 staff and a turnover of £9 million a year, leading them through four department managers in a weekly meeting",
        evidence: "My four department managers each run their own team and I hold a weekly meeting with them",
        evidenceSource: "follow-up-answer",
      },
      {
        gapId: "daniel-gap-2",
        section: "experience",
        before: "Cut stock loss from 2.1% to 1.3% of sales in two years",
        after:
          "Cut stock loss from 2.1% to 1.3% of sales in two years by setting up a weekly waste review with the fresh team, tracking the top ten lines and changing order quantities",
        evidence:
          "I set up a weekly waste review with the fresh team, tracked the top ten lines and changed the order quantities",
        evidenceSource: "follow-up-answer",
      },
    ],
    nextSteps: [
      {
        gapId: "daniel-gap-3",
        kind: "related-skill",
        suggestion:
          "Your closest real experience is running the stockroom and deliveries as deputy store manager. It is already on your CV; the cover letter can point to it.",
      },
    ],
  },
};

/**
 * The mock suggestions made from the CV alone, before any question: each persona's summary, rewritten for the job
 * with a fact from one of their own CV lines (the evidence).
 */
export const sampleCvSuggestions: Record<PersonaName, Proposal> = {
  sara: {
    changes: [
      {
        section: "summary",
        before: personas.sara.profile.summary,
        after:
          "Data science graduate with hands-on experience cleaning and analysing retail sales data in Python and SQL, and building Tableau dashboards for a regional sales team. Looking for a first analyst role in Manchester.",
        evidence: "Built Tableau dashboards for the regional sales team",
        evidenceSource: "cv",
      },
    ],
    nextSteps: [],
  },
  reza: {
    changes: [
      {
        section: "summary",
        before: personas.reza.profile.summary,
        after:
          "Former secondary school maths teacher and head of year with nine years of planning, organising and leading people, including coordinating the move to a new timetable for 1,100 students and 80 staff. Moving into project coordination, with PRINCE2 Foundation.",
        evidence: "Coordinated the move to a new school timetable for 1,100 students and 80 staff, delivered on time",
        evidenceSource: "cv",
      },
    ],
    nextSteps: [],
  },
  emma: {
    changes: [
      {
        section: "summary",
        before: personas.emma.profile.summary,
        after:
          "Junior web developer with a year of commercial experience building React and TypeScript websites for six agency clients. Looking for a remote front-end role.",
        evidence: "Build and maintain React and TypeScript websites for six agency clients",
        evidenceSource: "cv",
      },
    ],
    nextSteps: [],
  },
  daniel: {
    changes: [
      {
        section: "summary",
        before: personas.daniel.profile.summary,
        after:
          "Retail store manager with 15 years of experience running large teams and multi-million-pound budgets, and reporting weekly sales, waste and availability KPIs. Ready for an operations management role in the West Midlands.",
        evidence: "Report weekly sales, waste and availability KPIs to the area manager",
        evidenceSource: "cv",
      },
    ],
    nextSteps: [],
  },
};

/** The mock CV suggestions for a sample job; any other job gets none in mock mode. */
export function sampleCvSuggestionsFor(jobId: string): Proposal {
  const name = (Object.keys(personas) as PersonaName[]).find((key) => personas[key].match.jobId === jobId);
  return name ? sampleCvSuggestions[name] : { changes: [], nextSteps: [] };
}
