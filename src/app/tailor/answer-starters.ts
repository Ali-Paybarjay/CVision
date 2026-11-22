import type { Profile } from "@/shared/contracts";

/** One place from the user's own CV that can start an answer: a chip's words and the start it puts in the answer box. */
export type AnswerStarter = { label: string; start: string };

/** At most this many roles, so a long career does not fill the card; a project and a degree may follow. */
const maxRoles = 3;

/**
 * For a question that came with no answers to tap (#561): the user's roles, then their latest project and degree, each
 * as the start of an answer, such as "At Maroon Karan, I ". Made by code from the Profile only, so the start of an
 * answer never claims anything: the user writes what they did.
 */
export function answerStarters(profile: Profile): AnswerStarter[] {
  const seen = new Set<string>();
  const roles = profile.experience
    .filter((role) => {
      const key = `${role.title}|${role.company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxRoles)
    .map((role) => ({ label: `${role.title} · ${role.company}`, start: `At ${role.company}, I ` }));
  const project = profile.projects?.[0];
  const study = profile.education[0];
  return [
    ...roles,
    ...(project ? [{ label: project.name, start: `In my project “${project.name}”, I ` }] : []),
    ...(study ? [{ label: `${study.qualification} · ${study.institution}`, start: `During my ${study.qualification} at ${study.institution}, I ` }] : []),
  ];
}

/** The answer box after a chip is tapped: the new start replaces another chip's start, and keeps what the user wrote after it. */
export function withStarter(text: string, starter: AnswerStarter, all: AnswerStarter[]): string {
  const earlier = all.find((other) => text.startsWith(other.start));
  return starter.start + (earlier ? text.slice(earlier.start.length) : text.trimStart());
}
