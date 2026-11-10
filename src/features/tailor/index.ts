// Tailor: gap questions, honest CV changes and the Nothing invented check.
export { askGapQuestions, asksIfVerified, defaultGapQuestion, gapQuestionsPrompt, isStrongerGap, pickQuestions, questionGaps, questionTarget, skillGaps, strongerGaps } from "./gap-questions";
export { askForProposal, proposeChanges, suggestFromCv, type ProposeInput, type SuggestInput } from "./propose-changes";
export { enforceNothingInvented, roleClaimAdded, unsupportedReason, type EvidenceSources } from "./nothing-invented";
export { sampleAnswers, sampleCvSuggestions, sampleProposals } from "./samples";
export * from "./types";
export { findBrandProblems, type BrandProblem } from "./brand-check";
export {
  CoverLetterSchema,
  coverLetterText,
  declinedRequirements,
  inventedTerms,
  nothingMoreToAdd,
  sampleCoverLetter,
  writeCoverLetter,
  type CoverLetter,
  type CoverLetterInput,
  type NothingMore,
} from "./cover-letter";
