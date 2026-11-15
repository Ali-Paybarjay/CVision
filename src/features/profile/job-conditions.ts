import type { Job, JobCondition, JobConditionKind } from "@/shared/contracts";

// The conditions of a job (#222): requirements that are not a skill or experience, such as a driving licence, night
// shifts or a DBS check. The match leaves them out of the score and /jobs shows them apart, so a profile is never
// marked down for something a CV doesn't show. The job reader's model marks them; the word list below is the backup
// for a job read before it did. Professional registrations, degrees and specialist certificates are never conditions.

type Requirements = Pick<Job, "requirements" | "conditions">;

/**
 * The words of a professional registration, a licence to practise or a prescribing qualification. None is a licence
 * or card like a driving licence, and the job reader is told never to mark one; if it marks one as a credential
 * anyway, the mark is dropped so the criterion stays scored. Otherwise a nurse whose profile doesn't show NMC
 * registration would get no gap and no question (#421), and Tailor would never ask about the licence to practise
 * (#401). A registration in other words, such as "Registered Midwife", is left to the job reader. A check about a
 * registration, such as fitness to practise sanctions, keeps a mark of another kind.
 */
const professionalRegistration = [
  /\blicen[cs](?:e|es|ed) to practi[cs]e\b|\bpracti[cs]ing (?:licen[cs]e|certificate)s?\b|\bprofessional registration\b/i,
  // The UK's statutory registers, by initials or name, and Gas Safe, which Tailor asks about like one (#401). Never GCC
  // (also a Gulf driving licence) or PSNI (also the police).
  /\b(?:NMC|GMC|HCPC|GPhC|GDC|GOC|GOsC|SSSC|NISCC)\b|\b(?:Nursing (?:and|&) Midwifery|General (?:Medical|Dental|Optical|Pharmaceutical|Osteopathic|Chiropractic)|Health (?:and|&) Care Professions|Scottish Social Services|Northern Ireland Social Care) Council\b|\bSocial (?:Work England|Care Wales)\b|\bPharmaceutical Society of Northern Ireland\b|\bGas[- ]?Safe\b/i,
  // A prescribing qualification, never "prescribed" as in medication.
  /\bprescrib(?:e|er|ers|ing)\b/i,
];

/**
 * The job's conditions, each one of its requirements word for word. A condition the model wrote in other words than
 * any requirement is dropped, so that requirement stays scored as before, and so is a professional registration marked
 * as a credential. A job without `conditions` was read before the model marked them: the word list decides.
 */
export function jobConditions(job: Requirements): JobCondition[] {
  const requirements = [...job.requirements.essential, ...job.requirements.desirable];
  if (job.conditions === undefined) return conditionsByWords(requirements);

  const listed = new Set(requirements);
  const seen = new Set<string>();
  return job.conditions.filter(({ requirement, kind }) => {
    if (!listed.has(requirement) || seen.has(requirement)) return false;
    seen.add(requirement);
    return !(kind === "credential" && professionalRegistration.some((pattern) => pattern.test(requirement)));
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
      // A "full licence" is a driving licence, but "a full licence to practise" is a professional registration.
      /\bdriv(?:ing|er['’]?s?) licen[cs]e\b|\b(?:full|clean)(?: clean| full)?(?: UK)?(?: manual)? licen[cs]e\b(?! to practi[cs]e)|\b(?:HGV|LGV|C\+E|Class [12]) licen[cs]e\b|\bab(?:le|ility) to drive\b/i,
      /\bCSCS\b|\bSIA\b|\bCPCS\b/i,
      // A forklift licence or certificate, never experience operating a forklift: the CV shows that.
      /\b(?:fork[- ]?lift|FLT|counterbalance|reach truck)\b.*\b(?:licen[cs]es?|certificat\w*|tickets?)\b|\b(?:licen[cs]es?|certificat\w*|tickets?)\b.*\b(?:fork[- ]?lift|FLT|counterbalance|reach truck)\b/i,
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
