// A question with no answers to tap offers the user's own roles, project and degree to start the answer (#561).
// The start comes from the Profile only and claims nothing: the user writes what they did.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { answerStarters, withStarter } from "@/app/tailor/answer-starters";
import { GapCard } from "@/app/tailor/gap-card";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ answerGap: vi.fn(), decideChange: vi.fn() }));

const { profile, jobs } = personas.sara;

describe("answerStarters", () => {
  const starters = answerStarters(profile);

  it("starts with each role, by its employer, as the CV names it", () => {
    const role = profile.experience[0];
    expect(starters[0]).toEqual({ label: `${role.title} · ${role.company}`, start: `At ${role.company}, I ` });
  });

  it("ends with the first degree, and shows at most three roles", () => {
    const study = profile.education[0];
    expect(starters.at(-1)?.start).toBe(`During my ${study.qualification} at ${study.institution}, I `);
    const many = { ...profile, experience: Array.from({ length: 6 }, (_, index) => ({ ...profile.experience[0], company: `Firm ${index}` })) };
    expect(answerStarters(many).filter((starter) => starter.start.startsWith("At "))).toHaveLength(3);
  });

  it("never offers the same role twice", () => {
    const twice = { ...profile, experience: [profile.experience[0], profile.experience[0]] };
    expect(answerStarters(twice).filter((starter) => starter.start.startsWith("At "))).toHaveLength(1);
  });
});

describe("withStarter", () => {
  const [first, second] = answerStarters(profile);

  it("puts the start before what the user wrote", () => {
    expect(withStarter("led the project", first, [first, second])).toBe(`${first.start}led the project`);
  });

  it("swaps one role's start for another and keeps the rest", () => {
    expect(withStarter(`${first.start}led the project`, second, [first, second])).toBe(`${second.start}led the project`);
  });
});

describe("the question card", () => {
  const gap = { id: "g1", requirement: "Good project management", importance: "essential" as const, kind: "missing" as const, detail: "" };
  const card = (options?: string[]) =>
    renderToStaticMarkup(
      <GapCard
        jobId={jobs[0].id}
        prompt={{ gap, question: "Have you managed a project?", options }}
        state={{ phase: "open" }}
        setState={() => {}}
        onAnswered={() => {}}
        earlierAnswers={[]}
        changes={[]}
        onDecide={async () => {}}
        starters={answerStarters(profile)}
        main
      />,
    );

  it("offers the user's roles when the question has no answers to tap", () => {
    const html = card();
    expect(html).toContain("Where did you do this?");
    expect(html).toContain(`${profile.experience[0].title} · ${profile.experience[0].company}`);
  });

  it("does not offer them beside answers to tap", () => {
    expect(card(["I managed the dashboard project."])).not.toContain("Where did you do this?");
  });
});
