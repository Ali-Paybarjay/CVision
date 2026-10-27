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
 * Suggests what to add under each role of the user's LinkedIn Experience for one job, with askModel and
 * prompts/profile-linkedin-experience.md. The model only chooses lines by their ids; buildLinkedInSuggestions shows
 * them as the CV says them, and `rejected` lists any id that isn't the role's own, for the prompt evals. In mock mode
 * no model is called: simple rules choose each role's lines that show the ad's requirements (suggestByRules).
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
    // It answers with ids only, so the brand voice has nothing to shape.
    voice: false,
    // Up to five line ids and five skill ids for each role. Haiku thinks first and that counts too.
    maxTokens: 4000,
  });

  return buildLinkedInSuggestions(profile, job, match, answer);
}

/**
 * The request text: the job's requirements, each with what the profile shows of it now, then each role's duties and
 * results, and the skills, with the same ids as the match. Only what the model chooses from is sent: never the name,
 * contact details, summary, education, certificates or answers.
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
  const roleText = roles.map((role) => [`${role.id} · ${role.role.text} · ${role.role.context}`, ...role.lines.map(lineText)].join("\n")).join("\n\n");
  const skills = shared.filter((line) => line.kind === "skill").map(lineText).join("\n");

  return loadPrompt("profile-linkedin-experience", {
    job: withoutTags(`${job.title} at ${job.company}`, tags),
    requirements: withoutTags(requirements || "(none)", tags),
    roles: withoutTags(roleText || "(none)", tags),
    skills: withoutTags(skills || "(none)", tags),
  });
}

/** "L11 [duty] Built Tableau dashboards…" */
function lineText(line: EvidenceLine): string {
  return `${line.id} [${line.kind}] ${line.text}`;
}
