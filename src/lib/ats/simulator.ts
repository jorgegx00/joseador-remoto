import type { ParsedCv } from "@/types/cv";
import type { Job } from "@/types/job";
import type { AtsReport, AtsCheckResult, AtsIssue, KeywordMatch, AtsCheckName } from "@/types/ats";
import type { CheckerResult } from "./types";
import { checkKeywords, extractKeywords, matchKeywords } from "./keyword-matcher";
import { checkFormat } from "./format-checker";
import { validateStructure } from "./structure-validator";
import { checkContact } from "./contact-checker";
import { validateConsistency } from "./consistency-validator";
import { checkSpelling } from "./spell-checker";
import { analyzeLength } from "./length-analyzer";

// ---------------------------------------------------------------------------
// Weights for each checker — must sum to 1.0
// ---------------------------------------------------------------------------

const WEIGHTS: Record<AtsCheckName, number> = {
  keyword_match: 0.30,
  format_compatibility: 0.15,
  section_structure: 0.15,
  contact_data: 0.10,
  consistency: 0.10,
  spelling_grammar: 0.10,
  length_density: 0.10,
};

// ---------------------------------------------------------------------------
// Build an AtsCheckResult from a CheckerResult
// ---------------------------------------------------------------------------

function toCheckResult(
  name: AtsCheckName,
  result: CheckerResult,
): AtsCheckResult {
  return {
    name,
    score: result.score,
    weight: WEIGHTS[name],
    issues: result.issues,
    details: result.details,
  };
}

// ---------------------------------------------------------------------------
// Severity ranking for sorting
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ---------------------------------------------------------------------------
// runAtsSimulation — the main entry point
// ---------------------------------------------------------------------------

export function runAtsSimulation(
  cv: ParsedCv,
  rawText: string,
  job?: Job,
): AtsReport {
  // Determine file type from raw text heuristics (caller may not have it)
  // Default to "pdf" since we can't know for sure
  const fileType = "pdf";

  // ---- 1. Run all 7 checkers ----
  const keywordResult = checkKeywords(
    rawText,
    [...cv.skills.technical, ...cv.skills.soft],
    job?.description,
  );

  const formatResult = checkFormat(rawText, fileType);
  const structureResult = validateStructure(rawText, cv);
  const contactResult = checkContact(rawText, cv);
  const consistencyResult = validateConsistency(rawText, cv);
  const spellingResult = checkSpelling(rawText);
  const lengthResult = analyzeLength(rawText, cv, job?.description);

  // ---- 2. Build check results ----
  const checks: AtsCheckResult[] = [
    toCheckResult("keyword_match", keywordResult),
    toCheckResult("format_compatibility", formatResult),
    toCheckResult("section_structure", structureResult),
    toCheckResult("contact_data", contactResult),
    toCheckResult("consistency", consistencyResult),
    toCheckResult("spelling_grammar", spellingResult),
    toCheckResult("length_density", lengthResult),
  ];

  // ---- 3. Calculate weighted overall score ----
  let weightedScore = 0;
  let totalWeight = 0;

  for (const check of checks) {
    weightedScore += check.score * check.weight;
    totalWeight += check.weight;
  }

  const atsScore = totalWeight > 0
    ? Math.round(weightedScore / totalWeight)
    : 0;

  // ---- 4. Collect all issues, sort by severity ----
  const allIssues: AtsIssue[] = checks
    .flatMap((c) => c.issues)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2));

  // ---- 5. Build keyword_matches ----
  let keywordMatches: KeywordMatch;

  if (job?.description) {
    const keywords = extractKeywords(job.description);
    const result = matchKeywords(
      rawText,
      [...cv.skills.technical, ...cv.skills.soft],
      keywords,
    );
    keywordMatches = {
      matched: result.matched,
      missing: result.missing,
      partial: result.partial,
    };
  } else {
    keywordMatches = {
      matched: [],
      missing: [],
      partial: [],
    };
  }

  // ---- 6. Build and return AtsReport ----
  return {
    id: "",
    cv_id: "",
    job_id: job?.id ?? null,
    ats_score: atsScore,
    keyword_score: keywordResult.score,
    format_score: formatResult.score,
    structure_score: structureResult.score,
    contact_score: contactResult.score,
    consistency_score: consistencyResult.score,
    spelling_score: spellingResult.score,
    length_score: lengthResult.score,
    keyword_matches: keywordMatches,
    issues: allIssues,
    checks,
    narrative_report: "",
    narrative_scores: null,
    created_at: Date.now(),
  };
}
