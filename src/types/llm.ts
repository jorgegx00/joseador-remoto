export type LlmProviderName = "openai" | "anthropic" | "google" | "xai" | "deepseek" | "ollama";

export interface LlmConfig {
  provider: LlmProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** Ollama only: context window (num_ctx) sent with every request. */
  numCtx?: number;
}

export interface LlmProviderInfo {
  name: string;
  displayName: string;
  icon: string;
  website: string;
  pricingUrl: string;
  description: string;
  defaultModels: string[];
  requiresApiKey: boolean;
}

export interface MatchAnalysis {
  overall_match: number;
  skills_match: Array<{
    skill: string;
    found: boolean;
    importance: "critical" | "important" | "nice_to_have";
  }>;
  experience_match: number;
  seniority_fit: "under_qualified" | "good_fit" | "over_qualified";
  gaps: string[];
  strengths: string[];
  recommendation: string;
}

export interface NarrativeReport {
  summary_score: number;
  summary_feedback: string;
  achievement_score: number;
  achievement_feedback: string;
  star_format_score: number;
  star_feedback: string;
  tech_per_role_score: number;
  tech_feedback: string;
  personalization_score: number;
  personalization_feedback: string;
  overall_impression: string;
  top_improvements: Array<{
    area: string;
    current: string;
    suggested: string;
  }>;
}

export interface GeneratedCv {
  id: string;
  cv_id: string;
  job_id: string;
  content: string;
  /** Keyword coverage (0-100) of the source CV. Legacy rows hold the LLM match score. */
  match_score_before: number | null;
  /** Keyword coverage (0-100) of the tailored CV. Null when not measured. */
  match_score_after: number | null;
  llm_provider: string;
  llm_model: string;
  created_at: number;
}

export interface MatchAnalysisRecord {
  id: string;
  cv_id: string;
  job_id: string;
  analysis: MatchAnalysis;
  llm_provider: string;
  llm_model: string;
  /** Content fingerprints at analysis time; null on legacy rows (staleness unknown). */
  cv_fingerprint?: string | null;
  job_fingerprint?: string | null;
  created_at: number;
}

export interface CoverLetter {
  id: string;
  cv_id: string;
  job_id: string;
  content: string;
  tone: string;
  llm_provider: string;
  llm_model: string;
  created_at: number;
  updated_at: number;
}
