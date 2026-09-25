export type ApplicationStatus =
  | "saved"
  | "applied"
  | "phone_screen"
  | "interviewing"
  | "technical"
  | "final"
  | "rejected"
  | "offered"
  | "accepted"
  | "withdrawn";

export type InterviewType =
  | "phone_screen"
  | "technical"
  | "behavioral"
  | "system_design"
  | "hiring_manager"
  | "final"
  | "take_home";

export type InterviewOutcome = "passed" | "failed" | "pending" | "cancelled";
export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";

export interface Application {
  id: string;
  job_id: string;
  cv_id: string;
  generated_cv_id: string | null;
  status: ApplicationStatus;
  applied_at: number | null;
  notes: string;
  created_at: number;
  updated_at: number;
}

export interface Interview {
  id: string;
  application_id: string;
  scheduled_at: number;
  duration_minutes: number;
  interview_type: InterviewType;
  location: string;
  meeting_url: string;
  interviewer_name: string;
  interviewer_role: string;
  notes: string;
  feedback: string;
  outcome: InterviewOutcome;
  status: InterviewStatus;
  created_at: number;
  updated_at: number;
}
