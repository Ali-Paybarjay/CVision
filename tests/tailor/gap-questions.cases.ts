// Fictional people and ads for the gap questions eval (gap-questions-stronger.eval.ts). Never a real CV or ad (rule 8).
import type { Gap, Job, MatchResult, Profile, Strength } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

type Role = { title: string; company: string; duties: string[] };

function profileOf(fullName: string, summary: string, skills: string[], roles: Role[]): Profile {
  const base = personas.sara.profile;
  return {
    ...base,
    id: `${fullName}-profile`,
    fullName,
    summary,
    skills,
    experience: roles.map((role, index) => ({ ...base.experience[0], ...role, achievements: [], startDate: `${2022 - index * 5}-01`, endDate: index === 0 ? null : `${2026 - index * 5}-12` })),
    followUpAnswers: [],
  };
}

function jobOf(title: string, company: string, description: string, essential: string[], desirable: string[]): Job {
  return { ...personas.sara.jobs[0], id: `${company}-job`, title, company, description, requirements: { essential, desirable } };
}

function matchOf(job: Job, strengths: Strength[], gaps: Omit<Gap, "importance">[]): MatchResult {
  const importance = (requirement: string) => (job.requirements.essential.includes(requirement) ? "essential" : "desirable");
  return {
    jobId: job.id,
    score: 70,
    strengths,
    uncoveredRequirements: [],
    gaps: gaps.map((gap) => ({ ...gap, importance: importance(gap.requirement) })),
    reasoning: "Fictional match for the eval.",
  };
}

export type GapCase = {
  name: string;
  input: { profile: Profile; job: Job; match: MatchResult };
  /** Roles, employers and specialist terms from this CV or ad. */
  names: string[];
  terms: string[];
  /** Words an option must never claim, because the CV does not show them. */
  neverClaims?: RegExp;
};

const imaging = (() => {
  const profile = profileOf(
    "Owen Pritchard",
    "Field service engineer with 13 years on CT and X-ray systems for hospitals in the North West.",
    ["CT systems", "X-ray", "Fault finding", "Electrical safety testing", "IT literate", "Customer training"],
    [
      { title: "Senior Field Service Engineer", company: "Halden Medical Systems", duties: ["Installed CT scanners in NHS hospitals", "Planned maintenance on CT and X-ray rooms", "Fault finding on site", "Trained radiographers on new systems"] },
      { title: "Field Service Engineer", company: "Ridgeway Diagnostics", duties: ["Serviced mobile X-ray units", "Replaced X-ray tubes and detectors"] },
    ],
  );
  const essential = ["Installation and commissioning of CT systems", "Preventive maintenance of imaging equipment", "Fault diagnosis to component level", "Strong IT skills", "Networking infrastructure", "Full UK driving licence"];
  const desirable = ["Electrical safety testing to IEC 62353", "Customer applications training"];
  const job = jobOf(
    "Field Service Engineer, CT and MR",
    "Aldermoor Healthcare Technologies",
    "You will install, maintain and repair CT and MR systems across hospital sites. You will diagnose faults to component level, connect systems to hospital networks, PACS and RIS using DICOM and HL7, and test electrical safety to IEC 62353. Requirements: " +
      [...essential, ...desirable].join("; "),
    essential,
    desirable,
  );
  const match = matchOf(
    job,
    [
      { requirement: "Installation and commissioning of CT systems", evidence: "Installed CT scanners in NHS hospitals" },
      { requirement: "Preventive maintenance of imaging equipment", evidence: "Planned maintenance on CT and X-ray rooms" },
      { requirement: "Fault diagnosis to component level", evidence: "Fault finding on site" },
      { requirement: "Electrical safety testing to IEC 62353", evidence: "Skills: Electrical safety testing" },
      { requirement: "Customer applications training", evidence: "Trained radiographers on new systems" },
      { requirement: "Full UK driving licence", evidence: "Full UK driving licence" },
    ],
    [
      { id: "it", requirement: "Strong IT skills", kind: "unclear", detail: "The CV says IT literate but names no systems or networks." },
      { id: "network", requirement: "Networking infrastructure", kind: "missing", detail: "Nothing in the CV about networks." },
    ],
  );
  return {
    name: "(a) CT field service engineer for an imaging service engineer ad",
    input: { profile, job, match },
    names: ["Senior Field Service Engineer", "Field Service Engineer", "Halden", "Ridgeway", "NHS hospitals", "CT scanners", "X-ray", "radiographers", "Planned maintenance", "Fault finding"],
    terms: ["CT", "MR", "MRI", "X-ray", "PACS", "RIS", "DICOM", "HL7", "IEC 62353", "detector", "tube", "radiographer"],
  } satisfies GapCase;
})();

const processEngineer = (() => {
  const profile = profileOf(
    "Leila Moradi",
    "Process engineer with eight years on gas treatment and hydrogen test rigs.",
    ["Aspen HYSYS", "HAZOP", "P&IDs", "Equipment sizing", "Excel"],
    [
      { title: "Process Engineer", company: "Fenmoor Gas Processing", duties: ["Sized separators and heat exchangers for a gas treatment unit", "Took part in HAZOP reviews", "Updated P&IDs after plant changes"] },
      { title: "Research Engineer", company: "Kestrel Energy Lab", duties: ["Built a hydrogen permeation test rig", "Ran permeation tests and logged results"] },
    ],
  );
  const essential = ["Designing prototypes", "3D CAD (SolidWorks)", "Prototype testing and reporting", "Design for manufacture"];
  const job = jobOf("Prototype Design Engineer", "Brightwell Devices", `You will design, build and test prototypes for gas handling products. Requirements: ${essential.join("; ")}; Technical reports.`, essential, ["Technical reports"]);
  const match = matchOf(
    job,
    [
      { requirement: "Prototype testing and reporting", evidence: "Ran permeation tests and logged results" },
      { requirement: "Technical reports", evidence: "Updated P&IDs after plant changes" },
    ],
    [
      { id: "proto", requirement: "Designing prototypes", kind: "unclear", detail: "Built a test rig, but the CV does not say who designed it." },
      { id: "cad", requirement: "3D CAD (SolidWorks)", kind: "missing", detail: "No CAD tool in the CV." },
      { id: "dfm", requirement: "Design for manufacture", kind: "missing", detail: "Nothing about manufacture." },
    ],
  );
  return {
    name: "(b) process engineer for a prototype design engineer ad",
    input: { profile, job, match },
    names: ["Process Engineer", "Research Engineer", "Fenmoor", "Kestrel", "test rig", "gas treatment", "separators", "HAZOP"],
    terms: ["HYSYS", "HAZOP", "P&ID", "SolidWorks", "CAD", "permeation", "separator", "heat exchanger"],
  } satisfies GapCase;
})();

const nurse = (() => {
  const profile = profileOf(
    "Grace Adeyemi",
    "Registered nurse with six years on surgical wards.",
    ["Patient assessment", "Risk assessment", "Medication management", "Electronic patient records"],
    [{ title: "Staff Nurse", company: "St Aldhelm's Hospital", duties: ["Assessed and cared for up to eight surgical patients a shift", "Completed falls and pressure ulcer risk assessments", "Checked and set up infusion pumps"] }],
  );
  const essential = ["Mechanical design in SolidWorks", "FMEA", "Prototype testing", "Engineering degree"];
  const job = jobOf("Mechanical Design Engineer", "Corran Medical Devices", `You will design and test mechanical parts for infusion devices. Requirements: ${essential.join("; ")}; Working with clinical users.`, essential, ["Working with clinical users"]);
  const match = matchOf(
    job,
    [{ requirement: "Working with clinical users", evidence: "Checked and set up infusion pumps" }],
    essential.map((requirement, index) => ({ id: `n${index}`, requirement, kind: "missing" as const, detail: "Not in the CV." })),
  );
  return {
    name: "(c) nurse for a mechanical engineering ad",
    input: { profile, job, match },
    names: ["Staff Nurse", "St Aldhelm", "surgical", "ward", "infusion pumps", "risk assessments"],
    terms: ["infusion", "risk assessment", "FMEA", "SolidWorks"],
    neverClaims: /\b(i (designed|modelled|drew|built|machined)|solidworks|cad\b|fmea|prototype|engineering degree)/i,
  } satisfies GapCase;
})();

const sara = {
  name: "(d) Sara for a junior data analyst ad",
  input: { profile: personas.sara.profile, job: personas.sara.jobs[0], match: personas.sara.match },
  names: ["Data Analyst Intern", "Northgate", "Customer Assistant", "Greenway", "MSc", "dashboards", "sales"],
  terms: ["SQL", "Python", "pandas", "Tableau", "Power BI", "Git", "R"],
} satisfies GapCase;

export const gapCases: GapCase[] = [imaging, processEngineer, nurse, sara];
