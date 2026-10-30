// Fixture 1: a process engineer (L3) in UK chemicals manufacturing. Fictional person and companies.
import type { Job, Profile } from "@/shared/contracts";
import type { DraftQuestion } from "../engine/checks";
import type { ReviewOutput } from "../engine/schemas";
import type { InterviewFixture } from "./types";

const job: Job = {
  id: "fixture-process-engineer",
  title: "Process Engineer",
  company: "Calderbank Speciality Chemicals",
  location: "Runcorn",
  salary: { min: 42000, max: 50000, currency: "GBP", period: "year", isEstimate: false },
  contractType: "permanent",
  hours: "full-time",
  workMode: "on-site",
  description:
    "Calderbank Speciality Chemicals makes resins and solvent blends at an upper-tier COMAH site in Runcorn. We are looking for a Process Engineer to support our batch reactor and distillation plants.\n\nYou will own process improvement projects from scoping to handover, troubleshoot production problems with the operations team, and lead process hazard reviews. You will work independently on day-to-day engineering and report to the Engineering Manager.\n\nEssential:\n- Chartered or working towards chartership with IChemE\n- At least three years of process engineering experience in chemicals or a similar process industry\n- Mass and energy balances and process troubleshooting\n- Leading or taking part in HAZOP studies\n- Management of change on a live plant\n\nDesirable:\n- Batch distillation or reactor experience\n- Experience of DSEAR assessments\n- Process simulation with Aspen HYSYS\n\nSalary £42,000 to £50,000. Permanent, full-time, on-site.",
  requirements: {
    essential: [
      "Chartered or working towards chartership with IChemE",
      "Three years of process engineering in chemicals or a similar industry",
      "Mass and energy balances and process troubleshooting",
      "HAZOP studies",
      "Management of change on a live plant",
    ],
    desirable: ["Batch distillation or reactor experience", "DSEAR assessments", "Aspen HYSYS"],
  },
  url: "https://example.com/jobs/calderbank-process-engineer",
  source: "pasted",
};

const profile: Profile = {
  id: "fixture-process-engineer-profile",
  fullName: "Alex Morgan",
  contact: { email: "alex.morgan@example.com", phone: "07700 900505", location: "Warrington" },
  summary:
    "Process engineer with four years in speciality chemicals, working on batch reactors and solvent recovery. Working towards chartership with IChemE.",
  skills: ["Mass and energy balances", "HAZOP", "Management of change", "Root cause analysis", "Aspen HYSYS", "P&ID review"],
  experience: [
    {
      title: "Process Engineer",
      company: "Northfleet Coatings Ltd",
      location: "Widnes",
      startDate: "2022-03",
      endDate: null,
      duties: [
        "Support three batch reactor lines making alkyd resins",
        "Take part in HAZOP studies for plant modifications",
        "Raise and progress management of change requests for process changes",
      ],
      achievements: [
        "Reduced batch cycle time on reactor R2 by 12% by changing the heating profile",
        "Recovered 85% of waste xylene by recommissioning a solvent recovery still",
      ],
    },
    {
      title: "Graduate Process Engineer",
      company: "Mersey Polymers",
      location: "Ellesmere Port",
      startDate: "2020-09",
      endDate: "2022-02",
      duties: ["Completed mass balances for a polymer finishing line", "Supported shutdown planning"],
      achievements: [],
    },
  ],
  education: [
    {
      institution: "University of Leeds",
      qualification: "MEng",
      subject: "Chemical Engineering",
      startDate: "2016-09",
      endDate: "2020-06",
      grade: "2:1",
    },
  ],
  certifications: [],
  preferences: {
    salary: { min: 42000, max: 50000, currency: "GBP", period: "year", isEstimate: false },
    location: "Warrington",
    workModes: ["on-site"],
    contractTypes: ["permanent"],
    hours: ["full-time"],
  },
  followUpAnswers: [],
};

const questions: DraftQuestion[] = [
  {
    id: "q1",
    type: "cv-deep-dive",
    competencyId: "c4",
    focus: "verify-claim",
    stretch: false,
    text: "Your CV says you reduced batch cycle time on reactor R2 by 12% by changing the heating profile. Can you walk me through what you changed and how you measured the effect?",
    rationale: {
      jdQuote: "own process improvement projects from scoping to handover",
      cvQuote: "Reduced batch cycle time on reactor R2 by 12% by changing the heating profile",
      why: "Tests whether the candidate owned the improvement and can show it was real and safe.",
    },
    lookFors: [
      { id: "q1-l1", text: "Identified the constraint in the batch before changing it, from data rather than assumption", confidence: "high" },
      { id: "q1-l2", text: "Checked exotherm control and cooling capacity before changing the heating profile", confidence: "high" },
      { id: "q1-l3", text: "Used a fair baseline and enough batches to show the reduction was real", confidence: "high" },
      { id: "q1-l4", text: "Confirmed product quality stayed within specification", confidence: "medium" },
    ],
    anchors: {
      score1: "Describes the result only, or cannot explain what changed or why it worked.",
      score3: "Explains the change and gives a before-and-after figure, but says little about safety limits or how the effect was verified.",
      score5: "Explains the constraint, the safety checks on exotherm and cooling, a fair comparison over several batches, and the effect on quality.",
    },
    redFlags: [
      "Changed the heating profile without considering the reaction exotherm or cooling capacity",
      "Claims the gain from a single batch",
    ],
    followUps: [
      { id: "q1-f1", gapType: "missing-specifics", text: "Which measurements told you the change was working?" },
      { id: "q1-f2", gapType: "missing-reasoning", text: "Why did you change the heating profile rather than another part of the cycle?" },
      { id: "q1-f3", gapType: "unverified-claim", text: "How many batches did you compare to arrive at the 12% figure?" },
    ],
  },
  {
    id: "q2",
    type: "cv-deep-dive",
    competencyId: "c5",
    focus: "verify-claim",
    stretch: false,
    text: "Your CV says you recovered 85% of waste xylene by recommissioning a solvent recovery still. Can you walk me through how you brought the still back into service?",
    rationale: {
      jdQuote: "Batch distillation or reactor experience",
      cvQuote: "Recovered 85% of waste xylene by recommissioning a solvent recovery still",
      why: "Probes hands-on distillation experience and the safety of restarting idle plant handling a flammable solvent.",
    },
    lookFors: [
      { id: "q2-l1", text: "Inspection and integrity checks on the equipment before restart", confidence: "high" },
      { id: "q2-l2", text: "Considered the flammability of the solvent and the hazardous area classification", confidence: "high" },
      { id: "q2-l3", text: "Set operating conditions such as reflux and cut points to meet purity", confidence: "medium" },
      { id: "q2-l4", text: "Measured recovery and purity on a defined basis", confidence: "medium" },
    ],
    anchors: {
      score1: "Gives the outcome only, with no steps or safety checks.",
      score3: "Describes the main restart steps but misses either the hazardous area checks or how recovery was measured.",
      score5: "Gives a safe, ordered restart with integrity checks, hazardous area equipment checks, a controlled trial, operating settings and a measured result.",
    },
    redFlags: ["Restarted the still without pressure testing or inspection", "Does not recognise xylene as flammable"],
    followUps: [
      { id: "q2-f1", gapType: "missing-specifics", text: "What were the main steps between finding the still idle and running it again?" },
      { id: "q2-f2", gapType: "missing-key-point", text: "What safety reviews did the restart need before it ran?" },
      { id: "q2-f3", gapType: "unverified-claim", text: "How was the 85% recovery figure measured?" },
    ],
  },
  {
    id: "q3",
    type: "core-concept",
    competencyId: "c1",
    focus: "core-requirement",
    stretch: false,
    text: "In a batch reactor running an exothermic reaction, why can a cooling arrangement that was adequate at laboratory scale fail to control the temperature at plant scale?",
    rationale: {
      jdQuote: "Mass and energy balances and process troubleshooting",
      cvQuote: null,
      why: "A fundamental of heat balances on scale-up that matters on any reactor plant.",
    },
    lookFors: [
      { id: "q3-l1", text: "Heat generated scales with volume while jacket area scales more slowly, so area per unit volume falls", confidence: "high" },
      { id: "q3-l2", text: "Heat removal depends on area, the heat transfer coefficient and the temperature difference, and fouling reduces it", confidence: "medium" },
      { id: "q3-l3", text: "Semi-batch dosing limits the rate of heat generation", confidence: "high" },
      { id: "q3-l4", text: "Risk of thermal runaway if heat generation exceeds heat removal", confidence: "high" },
    ],
    anchors: {
      score1: "Gets the scale-up effect wrong or gives no physical reason.",
      score3: "Explains that heat removal does not keep pace with heat generation, without the controls that manage it.",
      score5: "Explains the area to volume effect, the factors in heat removal, dosing control and the runaway consequence.",
    },
    redFlags: ["Recommends charging all reactants at once to finish faster"],
    followUps: [
      { id: "q3-f1", gapType: "missing-reasoning", text: "What changes in the heat balance between a one-litre flask and a ten-tonne reactor?" },
      { id: "q3-f2", gapType: "technical-error", text: "Can you take me through the heat released over time if every reactant is charged at the start?" },
      { id: "q3-f3", gapType: "missing-key-point", text: "How would you control the rate at which heat is generated?" },
    ],
  },
  {
    id: "q4",
    type: "scenario",
    competencyId: "c2",
    focus: "probe-gap",
    stretch: false,
    text: "You are asked to lead a HAZOP on a new solvent dosing line, and the operations team want it finished in one afternoon. How would you run the study so that it is thorough and still achievable?",
    rationale: {
      jdQuote: "Leading or taking part in HAZOP studies",
      cvQuote: null,
      why: "The CV shows taking part in HAZOPs but not leading one, a must-have for this role.",
    },
    lookFors: [
      { id: "q4-l1", text: "Defines scope, nodes and design intent from up-to-date P&IDs before the meeting", confidence: "high" },
      { id: "q4-l2", text: "Assembles the right team, with an independent chair and a scribe", confidence: "high" },
      { id: "q4-l3", text: "Works through guidewords and deviations systematically", confidence: "high" },
      { id: "q4-l4", text: "Records actions with owners and follows them to close-out", confidence: "high" },
      { id: "q4-l5", text: "Pushes back on an unrealistic timescale rather than cutting coverage", confidence: "medium" },
    ],
    anchors: {
      score1: "Treats the HAZOP as an informal discussion or agrees to cut it short.",
      score3: "Describes the guideword method and a suitable team, but not the preparation or the follow-up of actions.",
      score5: "Prepares scope and drawings, chairs a systematic study with the right team, records owned actions, and protects coverage under time pressure.",
    },
    redFlags: ["Agrees to skip nodes to meet the deadline", "Chairs a HAZOP on their own design without independence"],
    followUps: [
      { id: "q4-f1", gapType: "missing-specifics", text: "What would you prepare before the first session?" },
      { id: "q4-f2", gapType: "missing-key-point", text: "What happens to the actions once the meeting ends?" },
      { id: "q4-f3", gapType: "missing-reasoning", text: "Why would you choose those people for the team?" },
    ],
  },
  {
    id: "q5",
    type: "design-tradeoff",
    competencyId: "c3",
    focus: "core-requirement",
    stretch: false,
    text: "A temporary bypass would let production continue while a faulty control valve is replaced, but it removes an automatic trip for a week. How would you decide whether to approve it under management of change?",
    rationale: {
      jdQuote: "Management of change on a live plant",
      cvQuote: null,
      why: "Tests judgement on overriding a safety function, a frequent and high-stakes decision on a live plant.",
    },
    lookFors: [
      { id: "q5-l1", text: "Assesses the hazard the trip protects against and how likely a demand is", confidence: "high" },
      { id: "q5-l2", text: "Specifies compensating measures such as a dedicated operator, reduced rates or an independent alarm", confidence: "high" },
      { id: "q5-l3", text: "Uses the right approval level and a time limit for overriding a safety function", confidence: "high" },
      { id: "q5-l4", text: "Treats stopping production as a credible option", confidence: "medium" },
    ],
    anchors: {
      score1: "Approves the bypass on production grounds without assessing the risk.",
      score3: "Follows the management of change process but gives vague safeguards.",
      score5: "Assesses the hazard, sets specific compensating measures, the approval level and time limit, and says when they would refuse and stop the plant.",
    },
    redFlags: ["Treats a safety trip override as a routine change", "Relies on operators to 'keep an eye on it'"],
    followUps: [
      { id: "q5-f1", gapType: "missing-reasoning", text: "What would you need to see before you judged the bypass safe enough?" },
      { id: "q5-f2", gapType: "missing-specifics", text: "Which compensating measures would you put in place while the trip is out of service?" },
      { id: "q5-f3", gapType: "missing-key-point", text: "What other options would you weigh against running with the bypass?" },
    ],
  },
  {
    id: "q6",
    type: "problem-solving",
    competencyId: "c1",
    focus: "core-requirement",
    stretch: false,
    text: "A dryer receives 1,000 kilograms per hour of wet solids at 20 per cent moisture and must produce product at 2 per cent moisture. Can you talk me through how you would estimate how much water it removes each hour?",
    rationale: {
      jdQuote: "Mass and energy balances and process troubleshooting",
      cvQuote: null,
      why: "A short mass balance that shows whether the candidate picks the right basis.",
    },
    lookFors: [
      { id: "q6-l1", text: "Uses the dry solids as the tie component", confidence: "high" },
      { id: "q6-l2", text: "Works out the product mass from the dry solids and the outlet moisture", confidence: "high" },
      { id: "q6-l3", text: "Avoids subtracting the moisture percentages directly", confidence: "high" },
      { id: "q6-l4", text: "Sanity-checks the result and states assumptions such as wet-basis moisture", confidence: "medium" },
    ],
    anchors: {
      score1: "No method, or subtracts the percentages to get the answer.",
      score3: "Uses the dry solids basis and reaches a reasonable figure but does not check it.",
      score5: "Sets up the balance on dry solids, reaches a sound figure, states the basis and sanity-checks the result.",
    },
    redFlags: ["Takes 18 per cent of the feed as the water removed"],
    followUps: [
      { id: "q6-f1", gapType: "missing-reasoning", text: "Which quantity stays the same as the solids pass through the dryer?" },
      { id: "q6-f2", gapType: "technical-error", text: "How would you check whether your figure is sensible?" },
    ],
  },
];

const blueprint: ReviewOutput["blueprint"] = {
  mixNote: null,
  slots: [
    { questionId: "q1", type: "cv-deep-dive", competencyId: "c4", focus: "verify-claim", reason: "The strongest CV result, on the project ownership the role expects." },
    { questionId: "q2", type: "cv-deep-dive", competencyId: "c5", focus: "verify-claim", reason: "Distillation experience behind a specific recovery claim." },
    { questionId: "q3", type: "core-concept", competencyId: "c1", focus: "core-requirement", reason: "Heat balance fundamentals for batch reactors, weight 3." },
    { questionId: "q4", type: "scenario", competencyId: "c2", focus: "probe-gap", reason: "HAZOP leadership is a must-have and the CV shows only taking part." },
    { questionId: "q5", type: "design-tradeoff", competencyId: "c3", focus: "core-requirement", reason: "Management of change judgement on a live plant." },
    { questionId: "q6", type: "problem-solving", competencyId: "c1", focus: "core-requirement", reason: "A short mass balance on the core competency." },
  ],
};

const review: ReviewOutput = {
  blueprint,
  questions,
  changelog: [
    {
      questionId: "q5",
      check: "not-cheap",
      fix: "Removed the leading premise ('Surely you would never approve…') so the candidate has to make the judgement.",
    },
    {
      questionId: "q6",
      check: "one-speakable-question",
      fix: "Wrote the units out in words (kilograms per hour, per cent) so the question reads aloud naturally.",
    },
  ],
};

const draftTexts: Record<string, string> = {
  q5: "Surely you would never approve a bypass that removes an automatic trip, so how would you handle a request for one under management of change while a faulty control valve is replaced?",
  q6: "A dryer receives 1,000 kg/h of wet solids at 20% moisture and must produce product at 2% moisture. Can you talk me through how you would estimate how much water it removes each hour?",
};

const noFollowUp = (reason: string) => ({ askFollowUp: false, gapType: "none" as const, plannedFollowUpId: null, followUpText: null, reason });

export const processEngineer: InterviewFixture = {
  id: "process-engineer",
  label: "Process engineer · L3 · chemicals manufacturing",
  description: "Alex Morgan, four years in speciality chemicals, applying to run process improvement on an upper-tier COMAH site.",
  profile,
  job,
  analyse: {
    roleProfile: {
      title: "Process Engineer",
      discipline: "Process engineering",
      sector: "Speciality chemicals manufacturing",
      ukContext: "Upper-tier COMAH site",
      roleLevel: "L3",
      roleLevelReason: {
        jdQuote: "You will work independently on day-to-day engineering",
        why: "Owns improvement projects end to end and works independently, with process hazard reviews to lead.",
      },
      competencies: [
        { id: "c1", name: "Mass and energy balances and troubleshooting", priority: "must-have", weight: 3, jdQuote: "Mass and energy balances and process troubleshooting" },
        { id: "c2", name: "HAZOP and process hazard reviews", priority: "must-have", weight: 3, jdQuote: "Leading or taking part in HAZOP studies" },
        { id: "c3", name: "Management of change on a live plant", priority: "must-have", weight: 2, jdQuote: "Management of change on a live plant" },
        { id: "c4", name: "Owning improvement projects", priority: "must-have", weight: 2, jdQuote: "own process improvement projects from scoping to handover" },
        { id: "c5", name: "Batch distillation and reactors", priority: "nice-to-have", weight: 2, jdQuote: "Batch distillation or reactor experience" },
        { id: "c6", name: "Hazardous area assessment", priority: "nice-to-have", weight: 1, jdQuote: "Experience of DSEAR assessments" },
      ],
      namedItems: [
        { text: "COMAH", kind: "regulation" },
        { text: "HAZOP", kind: "method" },
        { text: "DSEAR", kind: "regulation" },
        { text: "Aspen HYSYS", kind: "tool" },
      ],
    },
    candidateProfile: {
      cvLevel: "L3",
      cvLevelReason: "Four years on batch plant, raising and progressing changes and delivering measured improvements.",
      evidence: [
        { competencyId: "c1", cvQuote: "Completed mass balances for a polymer finishing line", estimatedLevel: "L2" },
        { competencyId: "c2", cvQuote: "Take part in HAZOP studies for plant modifications", estimatedLevel: "L2" },
        { competencyId: "c3", cvQuote: "Raise and progress management of change requests for process changes", estimatedLevel: "L3" },
        { competencyId: "c4", cvQuote: "Reduced batch cycle time on reactor R2 by 12% by changing the heating profile", estimatedLevel: "L3" },
        { competencyId: "c5", cvQuote: "Support three batch reactor lines making alkyd resins", estimatedLevel: "L3" },
        { competencyId: "c6", cvQuote: null, estimatedLevel: null },
      ],
      claimsToProbe: [
        { id: "k1", quote: "Reduced batch cycle time on reactor R2 by 12% by changing the heating profile", kind: "result" },
        { id: "k2", quote: "Recovered 85% of waste xylene by recommissioning a solvent recovery still", kind: "result" },
        { id: "k3", quote: "Raise and progress management of change requests for process changes", kind: "ownership" },
        { id: "k4", quote: "Support three batch reactor lines making alkyd resins", kind: "scale" },
      ],
      gaps: [{ competencyId: "c2", evidence: "weak", note: "Has taken part in HAZOP studies but shows no experience of leading one." }],
    },
  },
  generate: {
    blueprint,
    questions: questions.map((q) => (draftTexts[q.id] ? { ...q, text: draftTexts[q.id] } : q)),
  },
  review,
  report: {
    verdict:
      "Nearly ready, only just: your project and HAZOP answers are at the level this role expects, but your heat balance and management of change answers would worry an interviewer at an upper-tier COMAH site.",
    priorities: [
      {
        title: "Rebuild your heat and mass balance fundamentals",
        detail:
          "Your scale-up answer had the area to volume effect backwards and you did not attempt the dryer balance. Work through a few balances out loud, starting from the quantity that does not change.",
      },
      {
        title: "Prepare a firm position on overriding safety trips",
        detail:
          "This role asks for management of change on a live plant. Prepare how you would assess a trip override: the hazard, specific compensating measures, who approves it, and when you would stop the plant instead.",
      },
      {
        title: "Lead with the detail in your project stories",
        detail:
          "Your solvent recovery story only became convincing after a follow-up. Open each example with the steps and checks you made, then the result.",
      },
    ],
    levelGapNote: null,
    uncertaintyNotes: [],
  },
  answers: {
    q1: {
      kind: "strong",
      main: "On reactor R2 the alkyd batches spent a long time in the heat-up stage, and the batch records showed the jacket was sitting at full steam for over two hours while the temperature crept up. I compared that with the reaction kinetics from our development team and found the cook temperature was being approached far more cautiously than the exotherm required. Before changing anything I checked the cooling capacity: I worked out the worst-case heat release if the reaction ran away at the new ramp rate and confirmed the jacket and the emergency cooling could still remove it with margin. I wrote the change up under management of change, and we trialled a steeper ramp with a hold point before the exothermic stage. I took the twenty batches before the change as the baseline and compared them with the first fifteen batches after it, using the same grade so the comparison was fair. Average cycle time fell from about 14 hours to just over 12, which is the 12% on my CV. The lab confirmed acid value and viscosity stayed within specification, and we watched the peak temperature on every trial batch. The lesson I took was to collect the baseline before proposing the change, not after.",
      followUp: null,
      decision: noFollowUp("Covers the constraint, the safety check, a fair baseline and product quality."),
      evaluation: {
        lookForEvidence: [
          { lookForId: "q1-l1", status: "covered", quote: "the jacket was sitting at full steam for over two hours while the temperature crept up" },
          { lookForId: "q1-l2", status: "covered", quote: "I worked out the worst-case heat release if the reaction ran away at the new ramp rate" },
          { lookForId: "q1-l3", status: "covered", quote: "I took the twenty batches before the change as the baseline and compared them with the first fifteen batches after it" },
          { lookForId: "q1-l4", status: "covered", quote: "The lab confirmed acid value and viscosity stayed within specification" },
        ],
        errors: [],
        accuracyConfidence: "high",
        scores: { technicalAccuracy: 5, depthOfReasoning: 4, appliedEvidence: 5, clarity: 4 },
        justifications: {
          technicalAccuracy: "Correctly links the heating profile to the exotherm and checks cooling capacity at the new ramp rate.",
          depthOfReasoning: "Explains why the change was safe and how it was tested, but not how the hold point or stop criteria were chosen.",
          appliedEvidence: "Own actions, a 20 against 15 batch comparison on the same grade, a figure and a lesson learned.",
          clarity: "Follows the order of the project; a little long in the middle.",
        },
        strengths: [
          "Checks the safety case before changing anything ('worked out the worst-case heat release').",
          "Uses a fair before-and-after comparison on the same grade.",
        ],
        weaknesses: ["Does not say what would have stopped the trial if the peak temperature had risen."],
        improvement: "State the stop criteria you set for the trial batches, so the interviewer hears how you controlled the risk while testing.",
        strongerAnswerOutline: [
          "The constraint you found in the batch records and how you confirmed it",
          "The safety check on heat release and cooling capacity at the new ramp rate",
          "The trial plan, its stop criteria and the management of change approval",
          "The baseline, the comparison and the result: [your actual figures]",
          "What you would do differently next time",
        ],
        followUpClosedGap: null,
      },
    },
    q2: {
      kind: "shallow",
      main: "The still had not been used for a few years, so I worked with maintenance to get it running again. After that we were able to recover most of the xylene from the waste stream and reuse it in production, which saved money on raw materials and waste disposal. It was a good project and the site was pleased with the result.",
      followUp:
        "First I checked the inspection records and had the reboiler and condenser pressure tested, because the still had been mothballed. The area is a Zone 1 hazardous area because xylene is flammable, so I checked the instrumentation and motors were still suitable for the zone before anything was energised. We ran it first on water to test the controls, then on a small charge of waste solvent. I set the reflux ratio and the cut points with the lab so that the recovered xylene met our purity specification, and we measured recovery by weighing the solvent in and out over a month of campaigns.",
      decision: {
        askFollowUp: true,
        gapType: "missing-specifics",
        plannedFollowUpId: "q2-f1",
        followUpText:
          "You said you worked with maintenance to get it running again. What were the main steps between finding the still idle and running it again?",
        reason: "A genuine attempt that gives the outcome but none of the restart steps.",
      },
      evaluation: {
        lookForEvidence: [
          { lookForId: "q2-l1", status: "covered", quote: "I checked the inspection records and had the reboiler and condenser pressure tested" },
          { lookForId: "q2-l2", status: "covered", quote: "I checked the instrumentation and motors were still suitable for the zone before anything was energised" },
          { lookForId: "q2-l3", status: "covered", quote: "I set the reflux ratio and the cut points with the lab" },
          { lookForId: "q2-l4", status: "partial", quote: "we measured recovery by weighing the solvent in and out over a month of campaigns" },
        ],
        errors: [],
        accuracyConfidence: "high",
        scores: { technicalAccuracy: 4, depthOfReasoning: 3, appliedEvidence: 4, clarity: 3 },
        justifications: {
          technicalAccuracy: "The restart sequence, pressure testing and zone checks are sound.",
          depthOfReasoning: "Says what was done but rarely why, and does not explain what limited recovery to 85%.",
          appliedEvidence: "Concrete own actions after the follow-up, including a water trial and a month of mass balance.",
          clarity: "The first answer was vague; the follow-up answer was clear.",
        },
        strengths: [
          "Once prompted, gives an ordered restart with pressure testing and a water trial.",
          "Checks hazardous area equipment before energising.",
        ],
        weaknesses: [
          "The first answer was generic and only gave the detail when asked.",
          "Does not explain what limited the recovery to 85%.",
        ],
        improvement: "Lead with the restart steps and safety checks in your first answer, so the interviewer does not have to ask for them.",
        strongerAnswerOutline: [
          "Why the still was out of service and what you checked first",
          "The safety checks: pressure testing, hazardous area equipment, management of change",
          "How you set reflux and cut points to meet purity",
          "How you measured recovery and what limited it: [your actual figures]",
        ],
        followUpClosedGap: true,
      },
    },
    q3: {
      kind: "technically-wrong",
      main: "At plant scale the reactor is bigger, so it has more surface area for cooling and the cooling itself should actually be easier. When the temperature still runs away it is usually because the cooling water pump is too small or the water is too warm, so I would fit a bigger pump. I would also add all of the reactants at the start so the reaction finishes faster and spends less time at a high temperature, which reduces the risk. If that does not work, you could lower the jacket temperature set point.",
      followUp:
        "If everything is charged at the start the reaction goes faster and releases its heat quickly, but a bigger pump should be able to take that heat away.",
      decision: {
        askFollowUp: true,
        gapType: "technical-error",
        plannedFollowUpId: "q3-f2",
        followUpText: "Can you take me through the heat released over time if every reactant is charged at the start?",
        reason: "A genuine attempt with a technical error on charging all reactants at once.",
      },
      evaluation: {
        lookForEvidence: [
          { lookForId: "q3-l1", status: "missing", quote: null },
          { lookForId: "q3-l2", status: "partial", quote: "it is usually because the cooling water pump is too small or the water is too warm" },
          { lookForId: "q3-l3", status: "missing", quote: null },
          { lookForId: "q3-l4", status: "missing", quote: null },
        ],
        errors: [
          {
            claim: "A bigger reactor has more surface area for cooling, so cooling should be easier.",
            correction: "Volume grows faster than jacket area, so the cooling area per unit volume falls on scale-up and heat removal gets harder.",
          },
          {
            claim: "Adding all the reactants at the start reduces the risk.",
            correction: "Charging everything at once releases the heat fastest and removes the main control on heat generation; semi-batch dosing limits it.",
          },
        ],
        accuracyConfidence: "high",
        scores: { technicalAccuracy: 1, depthOfReasoning: 2, appliedEvidence: 2, clarity: 3 },
        justifications: {
          technicalAccuracy: "Two major errors: the area to volume effect is backwards and charging everything at once increases the risk.",
          depthOfReasoning: "Offers fixes without a heat balance to explain them.",
          appliedEvidence: "Generic remedies with no link to real plant practice.",
          clarity: "Easy to follow, even though the content is wrong.",
        },
        strengths: ["Recognises that cooling water flow and temperature limit heat removal."],
        weaknesses: [
          "Gets the scale-up effect backwards: area per unit volume falls as the reactor grows.",
          "Recommends charging all reactants at once, which increases the runaway risk.",
        ],
        improvement:
          "Before answering a scale-up question, compare how heat generated and heat removed each change with size, then say how you would control the rate of heat release.",
        strongerAnswerOutline: [
          "Heat generated scales with volume; jacket area scales more slowly",
          "Heat removal depends on area, the heat transfer coefficient and the temperature difference, and fouling reduces it",
          "Control heat generation with semi-batch dosing linked to temperature",
          "The consequence if generation outruns removal, and the protection layers: [your site's trip or relief arrangements]",
        ],
        followUpClosedGap: false,
      },
    },
    q4: {
      kind: "strong",
      main: "I would start by agreeing the scope with the project engineer: the dosing line from the drum bay to the reactor inlet, split into nodes at the pump and at the reactor connection. Before the meeting I would check the P&IDs are the latest revision and walk the line, because a HAZOP on out-of-date drawings wastes everyone's time. The team needs a chair who is not the designer, the process engineer, an operator who runs the line, someone from maintenance and instrumentation, and a scribe. In the session I would work node by node with the guidewords, such as no flow, more flow, reverse flow and more pressure, and record the cause, consequence, existing safeguards and any action. For a solvent line I would pay attention to static and to overfilling the reactor. On timing, one afternoon is realistic for a short line with two nodes, but I would tell the operations manager plainly that if we run out of time we book a second session rather than skipping nodes. Every action gets an owner and a date, and I would track them to close-out before the line is commissioned.",
      followUp: null,
      decision: noFollowUp("Covers preparation, team, method, actions and the time pressure."),
      evaluation: {
        lookForEvidence: [
          { lookForId: "q4-l1", status: "covered", quote: "check the P&IDs are the latest revision and walk the line" },
          { lookForId: "q4-l2", status: "covered", quote: "a chair who is not the designer, the process engineer, an operator who runs the line" },
          { lookForId: "q4-l3", status: "covered", quote: "I would work node by node with the guidewords" },
          { lookForId: "q4-l4", status: "covered", quote: "Every action gets an owner and a date, and I would track them to close-out" },
          { lookForId: "q4-l5", status: "covered", quote: "if we run out of time we book a second session rather than skipping nodes" },
        ],
        errors: [],
        accuracyConfidence: "high",
        scores: { technicalAccuracy: 5, depthOfReasoning: 4, appliedEvidence: 4, clarity: 5 },
        justifications: {
          technicalAccuracy: "Correct HAZOP method, team make-up and hazards for a solvent line (static, overfilling).",
          depthOfReasoning: "Explains why preparation and independence matter, but not how adequacy of safeguards is judged.",
          appliedEvidence: "Realistic practical detail on nodes, guidewords and close-out for this line.",
          clarity: "Well ordered and concise.",
        },
        strengths: [
          "Prepares properly: current P&IDs and a line walk before the meeting.",
          "Holds the line on coverage under time pressure ('book a second session rather than skipping nodes').",
        ],
        weaknesses: ["Says little about how you would judge whether the existing safeguards are enough."],
        improvement: "Add one sentence on how you would judge whether safeguards are adequate, for example by risk-ranking each scenario.",
        strongerAnswerOutline: [
          "Scope, nodes and design intent agreed from current drawings",
          "The team, with an independent chair and a scribe",
          "Guideword method, with how you judge whether safeguards are adequate",
          "Actions with owners and dates, tracked to close-out",
          "How you handle pressure to shorten the study",
        ],
        followUpClosedGap: null,
      },
    },
    q5: {
      kind: "shallow",
      main: "I would look at the risk and get the bypass approved by the right people under the management of change procedure. If it is safe enough we would go ahead with extra checks while the valve is replaced, and we would remove the bypass as soon as the work was done.",
      followUp:
        "I would want the operators to keep a close eye on the reactor and the shift manager to sign it off. As long as everyone knows the trip is out, it should be fine for a week.",
      decision: {
        askFollowUp: true,
        gapType: "missing-reasoning",
        plannedFollowUpId: "q5-f1",
        followUpText: "You said you would go ahead if it is safe enough. What would you need to see before you judged the bypass safe enough?",
        reason: "Names the procedure but gives no reasoning on the risk.",
      },
      evaluation: {
        lookForEvidence: [
          { lookForId: "q5-l1", status: "partial", quote: "I would look at the risk" },
          { lookForId: "q5-l2", status: "partial", quote: "I would want the operators to keep a close eye on the reactor" },
          { lookForId: "q5-l3", status: "partial", quote: "get the bypass approved by the right people under the management of change procedure" },
          { lookForId: "q5-l4", status: "missing", quote: null },
        ],
        errors: [
          {
            claim: "A shift manager's sign-off and general awareness are enough to run for a week without the trip.",
            correction:
              "Overriding a safety trip needs a risk assessment, defined compensating measures and approval at the level the site's override procedure sets, with a time limit.",
          },
        ],
        accuracyConfidence: "medium",
        scores: { technicalAccuracy: 2, depthOfReasoning: 2, appliedEvidence: 2, clarity: 3 },
        justifications: {
          technicalAccuracy: "Treats overriding a safety trip as a routine sign-off, which understates the hazard.",
          depthOfReasoning: "Never explains what makes the bypass safe or unsafe, even after the follow-up.",
          appliedEvidence: "'Keep a close eye' is not a specific compensating measure.",
          clarity: "Short and understandable.",
        },
        strengths: ["Knows the change has to go through management of change and be removed after the work."],
        weaknesses: [
          "Never says what hazard the trip protects against or how to judge the risk.",
          "The compensating measure offered is not specific enough to replace an automatic trip.",
        ],
        improvement:
          "Name the hazard the trip protects against first, then the specific compensating measures and the approval level, and say when you would refuse the bypass and stop the plant instead.",
        strongerAnswerOutline: [
          "The hazard the trip protects against and how likely a demand is in a week",
          "Specific compensating measures: [for example a dedicated operator, reduced rate, an independent alarm]",
          "Who approves overriding a safety trip at your site, and the time limit",
          "The alternative of stopping production, and when you would choose it",
        ],
        followUpClosedGap: false,
      },
    },
    q6: {
      kind: "dont-know",
      main: "I don't know.",
      followUp: null,
      decision: noFollowUp("No genuine attempt to answer, so the interview moves on."),
      evaluation: {
        lookForEvidence: [
          { lookForId: "q6-l1", status: "missing", quote: null },
          { lookForId: "q6-l2", status: "missing", quote: null },
          { lookForId: "q6-l3", status: "missing", quote: null },
          { lookForId: "q6-l4", status: "missing", quote: null },
        ],
        errors: [],
        accuracyConfidence: "high",
        scores: { technicalAccuracy: 1, depthOfReasoning: 1, appliedEvidence: 1, clarity: 1 },
        justifications: {
          technicalAccuracy: "No attempt at the balance.",
          depthOfReasoning: "No reasoning given.",
          appliedEvidence: "No evidence given.",
          clarity: "Nothing to assess.",
        },
        strengths: [],
        weaknesses: ["No attempt at a mass balance, which the job description lists as essential."],
        improvement:
          "When you are unsure, set up the balance out loud: name the quantity that does not change, write down what you know, and reason towards an estimate.",
        strongerAnswerOutline: [
          "Pick the tie component: the dry solids pass through unchanged",
          "Work out the dry solids in the feed, then the product mass at the outlet moisture",
          "The water removed is the difference between feed and product",
          "Sanity-check the figure and state assumptions such as wet-basis moisture",
        ],
        followUpClosedGap: null,
      },
    },
  },
};
