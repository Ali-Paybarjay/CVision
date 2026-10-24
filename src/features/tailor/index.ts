// Tailor: gap questions, honest CV changes and the Nothing invented check.
export { askGapQuestions, defaultGapQuestion } from "./gap-questions";
export { askForProposal, proposeChanges, type ProposeInput } from "./propose-changes";
export { enforceNothingInvented, unsupportedReason, type EvidenceSources } from "./nothing-invented";
export { sampleAnswers, sampleProposals } from "./samples";
export * from "./types";
export { findBrandProblems, type BrandProblem } from "./brand-check";
export {
  CoverLetterSchema,
  coverLetterText,
  inventedTerms,
  sampleCoverLetter,
  writeCoverLetter,
  type CoverLetter,
  type CoverLetterInput,
} from "./cover-letter";
