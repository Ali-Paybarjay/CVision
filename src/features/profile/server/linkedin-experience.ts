import "server-only";
import { askModel, loadPrompt } from "@/shared/ai";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import {
  buildLinkedInSuggestions,
  LinkedInAnswerSchema,
  linkedInRoles,
  requirementFindings,
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
 * that name the ad's requirements, word for word (suggestByRules).
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
    sample: suggestByRules(profile, job),
    requester: options.requester,
    // A sentence and up to five short lines for each role. Haiku thinks first and that counts too.
    maxTokens: 8000,
  });

  return buildLinkedInSuggestions(profile, job, match, answer);
}

/**
 * The request text: the job's requirements, each with what the match found, the profile's duties and results grouped
 * by role, the user's answers and their skills, with the same ids as the match. Only lines that can back a line or a
 * skill are sent: never the name, contact details, summary, education or certificates.
 */
export function linkedInPrompt(profile: Profile, job: Job, match: MatchResult | null): Promise<string> {
  const tags = ["job", "requirements", "roles", "answers", "skills"];
  const found = requirementFindings(match);
  const requirements = jobRequirements(job)
    .map((requirement) => {
      const status = found.get(requirement.text);
      return `${requirement.id} (${requirement.importance}${status ? `, ${status}` : ""}): ${requirement.text}`;
    })
    .join("\n");

  const { roles, shared } = linkedInRoles(profile);
  const roleText = roles
    .map((role) => [`${role.id} · ${role.role.text} · ${role.role.context}`, ...role.lines.map(lineText)].join("\n"))
    .join("\n\n");

  const listed = (kind: EvidenceLine["kind"]) => shared.filter((line) => line.kind === kind).map(lineText).join("\n");

  return loadPrompt("profile-linkedin-experience", {
    job: withoutTags(`${job.title} at ${job.company}`, tags),
    requirements: withoutTags(requirements || "(none)", tags),
    roles: withoutTags(roleText || "(none)", tags),
    answers: withoutTags(listed("answer") || "(none)", tags),
    skills: withoutTags(listed("skill") || "(none)", tags),
  });
}

/** "L11 [duty] Built Tableau dashboards…"; an answer also gives its question. */
function lineText(line: EvidenceLine): string {
  const label = line.kind === "answer" && line.context ? `${line.kind} · ${line.context}` : line.kind;
  return `${line.id} [${label}] ${line.text}`;
}
