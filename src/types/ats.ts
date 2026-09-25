export type AtsSeverity = "critical" | "warning" | "info";

export type AtsCheckName =
  | "keyword_match"
  | "format_compatibility"
  | "section_structure"
  | "contact_data"
  | "consistency"
  | "spelling_grammar"
  | "length_density";

export interface AtsIssue {
  check: AtsCheckName;
  severity: AtsSeverity;
  message: string;
  fix: string;
}

export interface KeywordMatch {
  matched: Array<{ keyword: string; count: number; locations: string[] }>;
  missing: Array<{ keyword: string; importance: number }>;
  partial: Array<{ keyword: string; foundAs: string }>;
}

export interface AtsCheckResult {
  name: AtsCheckName;
  score: number;
  weight: number;
  issues: AtsIssue[];
  details: Record<string, unknown>;
}

export interface AtsReport {
  id: string;
  cv_id: string;
  job_id: string | null;
  ats_score: number;
  keyword_score: number;
  format_score: number;
  structure_score: number;
  contact_score: number;
  consistency_score: number;
  spelling_score: number;
  length_score: number;
  keyword_matches: KeywordMatch;
  issues: AtsIssue[];
  checks: AtsCheckResult[];
  narrative_report: string;
  narrative_scores: NarrativeScores | null;
  created_at: number;
}

export interface NarrativeScores {
  summary_quality: number;
  achievement_quantification: number;
  star_format: number;
  tech_per_role: number;
  personalization: number;
  overall_impression: number;
}
