// Live prompt eval for #446: real requests to the model, run with `npm run eval`. An answer that names an older role
// gives a work line for that role: one that rewrites a line of it, or a new line that roleForNewLine puts under it.
import { describe, expect, it } from "vitest";
import { askForProposal } from "@/features/tailor";
import { roleForNewLine } from "@/features/tailor/tailored-cv";
import { getAiProvider } from "@/shared/ai";
import { personas } from "@/shared/sample-data";

const { profile, jobs, match } = personas.sara;
const greenway = profile.experience.findIndex((role) => role.company === "Greenway Foods");
const answers = [
  {
    gapId: "sara-gap-1",
    question: "When have you explained something technical to people without a technical background?",
    answer: "At Greenway Foods I trained new starters on the tills and explained the stock system to them in plain words.",
    hasExperience: true,
  },
];

describe.skipIf(!getAiProvider())("A new work line goes under the role the answer names (live)", () => {
  it("puts Sara's Greenway Foods answer under Greenway Foods", async () => {
    const proposal = await askForProposal({ profile, job: jobs[0], match, answers, sample: { changes: [], nextSteps: [] } });
    // Only the changes this answer gave: a change may also quote a follow-up answer already in Sara's Profile, about
    // her Northgate work, and that one rightly stays there.
    const fromAnswer = (evidence: string) => answers[0].answer.toLowerCase().includes(evidence.toLowerCase().replace(/[.\s]+$/, ""));
    const experience = proposal.changes.filter((change) => change.section === "experience" && fromAnswer(change.evidence));
    for (const change of proposal.changes) console.log(`=== CHANGE\n${change.before ?? "(new)"}\n→ ${change.after}\nevidence: ${change.evidence}`);

    expect(experience.length).toBeGreaterThan(0);
    for (const change of experience) {
      const role =
        change.before === null
          ? roleForNewLine(profile, change)
          : profile.experience.findIndex((item) => [...item.duties, ...item.achievements].includes(change.before!));
      expect(role, change.after).toBe(greenway);
    }
  });
});
