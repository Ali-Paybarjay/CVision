// Tailor: gap questions, honest CV changes and the Nothing invented check.
export { askGapQuestions, defaultGapQuestion, skillGaps } from "./gap-questions";
export { askForProposal, proposeChanges, suggestFromCv, type ProposeInput, type SuggestInput } from "./propose-changes";
export { enforceNothingInvented, unsupportedReason, type EvidenceSources } from "./nothing-invented";
export { sampleAnswers, sampleCvSuggestions, sampleProposals } from "./samples";
export * from "./types";
export { findBrandProblems, type BrandProblem } from "./brand-check";
export {
  CoverLetterSchema,
  coverLetterText,
  declinedRequirements,
  inventedTerms,
  sampleCoverLetter,
  writeCoverLetter,
  type CoverLetter,
  type CoverLetterInput,
} from "./cover-letter";
