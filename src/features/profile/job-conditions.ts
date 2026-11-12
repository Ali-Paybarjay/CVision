import type { Job, JobCondition, JobConditionKind } from "@/shared/contracts";

// The conditions of a job (#222): requirements that are not a skill or experience, such as a driving licence, night
// shifts or a DBS check. The match leaves them out of the score and /jobs shows them apart, so a profile is never
// marked down for something a CV doesn't show. The job reader's model marks them; the word list below is the backup
// for a job read before it did. Professional registrations, degrees and specialist certificates are never conditions.

type Requirements = Pick<Job, "requirements" | "conditions">;

/**
 * The job's conditions, each one of its requirements word for word. A condition the model wrote in other words than
 * any requirement is dropped, so that requirement stays scored as before. A job without `conditions` was read before
 * the model marked them: the word list decides.
 */
export function jobConditions(job: Requirements): JobCondition[] {
  const requirements = [...job.requirements.essential, ...job.requirements.desirable];
  if (job.conditions === undefined) return conditionsByWords(requirements);

  const listed = new Set(requirements);
  const seen = new Set<string>();
  return job.conditions.filter(({ requirement }) => {
    if (!listed.has(requirement) || seen.has(requirement)) return false;
    seen.add(requirement);
    return true;
  });
}

/** The words that mark a condition, by kind. A requirement matching more than one kind takes the first: sensitive. */
const conditionWords: [JobConditionKind, RegExp[]][] = [
  [
    "sensitive",
    [
      // Right to work and nationality (#170): read from the ad only, never asked.
      /\bright to work\b|\b(?:eligib\w*|entitle\w*|permission) to work\b|\bwork permit\b|\bvisa\b(?!\s+(?:payment|card|debit|credit))|\b(?:UK|British) nationals?\b|\bnationality\b/i,
      // Criminal-offence data (UK GDPR Article 10).
      /\bDBS\b|\bPVG\b|\bcriminal record|\b(?:basic|standard|enhanced) disclosure\b|\bpenalty points\b/i,
      /\bsecurity (?:clearance|vetting|cleared)\b|\bBPSS\b|\b(?:SC|DV|CTC)[- ](?:clearance|cleared|vetting|vetted)\b|\bvetting\b/i,
      // Health (special category data).
      /\b(?:lift|lifting|carry|carrying)\b.*(?:\d\s?kg\b|\bkilos?\b|\bheavy\b)|\bstand(?:ing)?\b.*\b(?:long|extended) periods\b|\bphysically (?:fit|demanding|active)\b|\bphysical fitness\b/i,
    ],
  ],
  [
    "credential",
    [
      /\bdriv(?:ing|er['’]?s?) licen[cs]e\b|\b(?:full|clean)(?: clean| full)?(?: UK)?(?: manual)? licen[cs]e\b|\b(?:HGV|LGV|C\+E|Class [12]) licen[cs]e\b|\bab(?:le|ility) to drive\b/i,
      /\bCSCS\b|\bSIA\b|\bCPCS\b|\bfork[- ]?lift\b|\bFLT\b|\bcounterbalance\b/i,
    ],
  ],
  [
    "working",
    [
      /\b(?:willing|willingness|able|ability|prepared|happy|open|available)\b.*\btravel|\btravel(?:ling)?\b.*\b(?:required|as needed|when needed|across|within|throughout|internationally|nationally|overnight|between sites|to sites)\b|\b(?:frequent|regular|occasional|some|extensive|national|international|UK[- ]wide) travel\b|\bovernight stays?\b/i,
      /\b(?:nights?|weekends?|evenings?|bank holidays?|unsocial hours)\b.*\b(?:work|working|shifts?|cover|rota)\b|\b(?:work|working|shifts?|cover|available|availability)\b.*\b(?:nights|weekends|evenings|bank holidays|unsocial hours)\b|\bshift (?:work|patterns?)\b|\b(?:rotating|rotational) (?:shifts?|rota)\b|\bon[- ]call\b|\bflexib(?:le|ility)\b.*\b(?:hours|shifts?|availability)\b/i,
      /\b(?:willing|willingness|able|prepared|happy|open)\b.*\breloca/i,
      /\b(?:own|access to a|use of a) (?:car|vehicle|transport)\b|\bbusiness car insurance\b/i,
    ],
  ],
];

/** The backup: conditions found by their words, for a job read before the model marked them. */
export function conditionsByWords(requirements: string[]): JobCondition[] {
  const seen = new Set<string>();
  return requirements.flatMap((requirement) => {
    if (seen.has(requirement)) return [];
    seen.add(requirement);
    const match = conditionWords.find(([, patterns]) => patterns.some((pattern) => pattern.test(requirement)));
    return match ? [{ requirement, kind: match[0] }] : [];
  });
}

/** One group of conditions on /jobs, in the order credential, working, sensitive; only groups with something in them. */
export type ConditionGroup = { kind: JobConditionKind; items: { requirement: string; desirable: boolean }[] };

export function conditionGroups(job: Requirements): ConditionGroup[] {
  const conditions = jobConditions(job);
  const essential = new Set(job.requirements.essential);
  return (["credential", "working", "sensitive"] as const)
    .map((kind) => ({
      kind,
      items: conditions
        .filter((condition) => condition.kind === kind)
        .map(({ requirement }) => ({ requirement, desirable: !essential.has(requirement) })),
    }))
    .filter((group) => group.items.length > 0);
}
