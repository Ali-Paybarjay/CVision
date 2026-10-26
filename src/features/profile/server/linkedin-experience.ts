import "server-only";
import { askModel, loadPrompt } from "@/shared/ai";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import {
  buildLinkedInSuggestions,
  currentFindings,
  LinkedInAnswerSchema,
  linkedInRoles,
  suggestByRules,
  type LinkedInSuggestions,
  type RejectedSuggestion,
} from "../linkedin";
import { jobRequirements, type EvidenceLine } from "../match";
import { withoutTags } from "./check-job";
import type { Requester } from "./extract-profile";

/**
 * Suggests what to write under each role of the user's LinkedIn Experience for one job, with askModel and
 * prompts/profile-linkedin-experience.md. Only what the profile backs up is kept (buildLinkedInSuggestions);
 * `rejected` lists the rest, for the prompt evals. In mock mode no model is called: each role gets its own lines
 * that show the ad's requirements, word for word (suggestByRules).
 */
export async function suggestLinkedInExperience(
  profile: Profile,
  job: Job,
  match: MatchResult | null,
  options: { requester?: Requester } = {},
): Promise<{ suggestions: LinkedInSuggestions; rejected: RejectedSuggestion[] }> {
  const answer = await askModel({
    feature: "profile-linkedin-experience",
    prompt: await linkedInPrompt(profile, job, match),
    schema: LinkedInAnswerSchema,
    sample: suggestByRules(profile, job, match),
    requester: options.requester,
    // Up to five short lines and five skills for each role. Haiku thinks first and that counts too.
    maxTokens: 8000,
  });

  return buildLinkedInSuggestions(profile, job, match, answer);
}

/**
 * The request text: the job's requirements, each with what the profile shows of it now, then the profile's duties,
 * results and answers grouped by role, and the skills, with the same ids as the match. Only lines that can back a line
 * or a skill are sent: never the name, contact details, summary, education or certificates, nor an answer that isn't
 * clearly about one role.
 */
export function linkedInPrompt(profile: Profile, job: Job, match: MatchResult | null): Promise<string> {
  const tags = ["job", "requirements", "roles", "skills"];
  const found = currentFindings(profile, job, match);
  const requirements = jobRequirements(job)
    .map((requirement) => {
      const status = found.get(requirement.text);
      return `${requirement.id} (${requirement.importance}${status ? `, ${status}` : ""}): ${requirement.text}`;
    })
    .join("\n");

  const { roles, shared } = linkedInRoles(profile);
  const roleText = roles
    .map((role) => [`${role.id} · ${role.role.text} · ${role.role.context}`, ...[...role.lines, ...role.answers].map(lineText)].join("\n"))
    .join("\n\n");
  const skills = shared.filter((line) => line.kind === "skill").map(lineText).join("\n");

  return loadPrompt("profile-linkedin-experience", {
    job: withoutTags(`${job.title} at ${job.company}`, tags),
    requirements: withoutTags(requirements || "(none)", tags),
    roles: withoutTags(roleText || "(none)", tags),
    skills: withoutTags(skills || "(none)", tags),
  });
}

/** "L11 [duty] Built Tableau dashboards…"; an answer also gives its question. */
function lineText(line: EvidenceLine): string {
  const label = line.kind === "answer" && line.context ? `${line.kind} · ${line.context}` : line.kind;
  return `${line.id} [${label}] ${line.text}`;
}
