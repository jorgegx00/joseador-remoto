// Re-export types from the shared types module
export type {
  AtsReport,
  AtsCheckResult,
  AtsIssue,
  AtsSeverity,
  AtsCheckName,
  KeywordMatch,
  NarrativeScores,
} from "@/types/ats";

// Internal types
export { STOP_WORDS } from "./types";
export type { CheckerResult, KeywordExtractionResult } from "./types";

// Dictionary
export { TECH_TERMS, TECH_SYNONYMS, isTechTerm, getSynonyms } from "./tech-dictionary";

// Individual checkers
export { extractKeywords, matchKeywords, checkKeywords } from "./keyword-matcher";
export { checkFormat } from "./format-checker";
export { validateStructure } from "./structure-validator";
export { checkContact } from "./contact-checker";
export { validateConsistency } from "./consistency-validator";
export { checkSpelling } from "./spell-checker";
export { analyzeLength } from "./length-analyzer";

// Orchestrator
export { runAtsSimulation } from "./simulator";
