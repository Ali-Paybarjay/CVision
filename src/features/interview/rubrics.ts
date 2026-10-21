import type { QuestionCategory, RubricId, TechnicalQuestionType } from "./contracts";

export type RubricDimension = {
  key: string;
  label: string;
  /** What a 1, a 3 and a 5 look like; 2 and 4 fall between. */
  anchors: { score1: string; score3: string; score5: string };
};

export type Rubric = {
  id: RubricId;
  category: QuestionCategory;
  /** false while the rubric is reserved for a later stage. */
  ready: boolean;
  /** prompts/<prompt>.md that scores answers with this rubric. */
  prompt: string;
  dimensions: RubricDimension[];
};

/** technical-v1: the rubric for technical questions. */
export const technicalV1: Rubric = {
  id: "technical-v1",
  category: "technical",
  ready: true,
  prompt: "interview-evaluate-technical",
  dimensions: [
    {
      key: "technicalAccuracy",
      label: "Technical accuracy",
      anchors: {
        score1: "Major errors or misconceptions",
        score3: "Broadly correct, with minor imprecision",
        score5: "Correct and precise, including edge conditions",
      },
    },
    {
      key: "depthOfReasoning",
      label: "Depth of reasoning",
      anchors: {
        score1: "States what, not why",
        score3: "Explains why for the main choices",
        score5: "Weighs alternatives and trade-offs and anticipates failure modes, at the role's level",
      },
    },
    {
      key: "appliedEvidence",
      label: "Applied evidence",
      anchors: {
        score1: "Generic or textbook only",
        score3: "Some concrete specifics from own work or realistic practice",
        score5: "Specific, verifiable detail: own actions, context, numbers, outcome and lesson learned",
      },
    },
    {
      key: "clarity",
      label: "Clarity",
      anchors: {
        score1: "Hard to follow",
        score3: "Understandable, with some rambling",
        score5: "Structured, concise, precise terminology",
      },
    },
  ],
};

/** What "applied evidence" means for each technical question type. */
export const appliedEvidenceByType: Record<TechnicalQuestionType, string> = {
  "cv-deep-dive": "The candidate's own actions and results.",
  "core-concept": "Links the concept to practical use in this role.",
  scenario: "Realistic practical detail and constraints.",
  "design-tradeoff": "Realistic practical detail and constraints.",
  "problem-solving": "States assumptions, sanity-checks the result and notes practical limits.",
};

/**
 * behavioural-v1: reserved for stage 2 (UK competency-based questions).
 * Its four criteria are the original brief's, and match the keys of AnswerScores in @/shared/contracts.
 */
export const behaviouralV1: Rubric = {
  id: "behavioural-v1",
  category: "behavioural",
  ready: false,
  prompt: "interview-evaluate-behavioural",
  dimensions: [
    { key: "relevance", label: "Relevance to the job", anchors: { score1: "", score3: "", score5: "" } },
    { key: "star", label: "STAR structure", anchors: { score1: "", score3: "", score5: "" } },
    { key: "evidence", label: "Evidence and examples", anchors: { score1: "", score3: "", score5: "" } },
    { key: "clarity", label: "Clarity", anchors: { score1: "", score3: "", score5: "" } },
  ],
};

const registry: Record<QuestionCategory, Rubric> = {
  technical: technicalV1,
  behavioural: behaviouralV1,
};

/** The rubric for a question category. Throws for a category whose rubric is still reserved. */
export function rubricFor(category: QuestionCategory): Rubric {
  const rubric = registry[category];
  if (!rubric.ready) {
    throw new Error(`The ${rubric.id} rubric is reserved for stage 2 and cannot score answers yet.`);
  }
  return rubric;
}
