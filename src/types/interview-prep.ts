export type PitchVariant = "casual" | "formal" | "technical";

export type GlassdoorDifficulty = "easy" | "medium" | "hard";
export type GlassdoorExperience = "positive" | "negative" | "neutral";

export interface GlassdoorInterviewReview {
  id: string;
  company_id: string;
  role_title: string;
  difficulty: GlassdoorDifficulty;
  overall_experience: GlassdoorExperience;
  interview_process: string;
  questions: string[];
  tips: string;
  offer_received: boolean;
  scraped_at: number;
  created_at: number;
}

export interface CompanyBrief {
  overview: string;
  culture_values: string[];
  interview_process: string;
  pros: string[];
  cons: string[];
  talking_points: string[];
  questions_to_ask: string[];
  generated_at: number;
}

export interface StarStory {
  id: string;
  cv_id: string;
  experience_index: number;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills_demonstrated: string[];
  is_user_edited: boolean;
  created_at: number;
  updated_at: number;
}

export interface StrengthEntry {
  strength: string;
  example: string;
  relevance: string;
}

export interface WeaknessEntry {
  weakness: string;
  strategy: "past_overcame" | "current_improving";
  response: string;
}

export interface InterviewPrep {
  id: string;
  application_id: string;
  pitch_casual: string;
  pitch_formal: string;
  pitch_technical: string;
  strengths: StrengthEntry[];
  weaknesses: WeaknessEntry[];
  company_brief: string;
  custom_questions: Array<{
    category: string;
    question: string;
    rationale: string;
  }>;
  checklist_state: ChecklistState;
  created_at: number;
  updated_at: number;
}

export interface ChecklistState {
  pre_interview: Record<string, boolean>;
  video_call_setup: Record<string, boolean>;
  during_interview: Record<string, boolean>;
  closing: Record<string, boolean>;
  post_interview: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// LLM prep documents grounded in CV + job post
// ---------------------------------------------------------------------------

export type PrepDocumentKind = "gap_brief" | "round_pack" | "study_plan";

export interface PrepDocument<T = unknown> {
  id: string;
  application_id: string;
  /** Empty string for application-level documents (gap brief). */
  interview_id: string;
  kind: PrepDocumentKind;
  language: "en" | "es";
  content: T;
  created_at: number;
  updated_at: number;
}

export interface MockTurn {
  question: string;
  intent: string;
  is_follow_up: boolean;
  answer: string;
  /** Coaching on `answer`; null until answered (or if coaching failed). */
  coaching: import("@/lib/llm/prep-schemas").MockCoaching | null;
}

export interface MockSession {
  id: string;
  application_id: string;
  interview_id: string;
  interview_type: import("./application").InterviewType;
  language: "en" | "es";
  coaching_language: "en" | "es";
  total_questions: number;
  turns: MockTurn[];
  report: import("@/lib/llm/prep-schemas").MockReport | null;
  status: "active" | "completed";
  created_at: number;
  updated_at: number;
}
