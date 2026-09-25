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

/** Why an application ended up closed; "ghosted" is recorded on top of status `rejected`. */
export type ClosedReason = "ghosted" | "rejected" | "withdrew" | "declined";

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
  /** Last time the user heard from / wrote to the company (drives follow-up reminders). */
  last_contact_at: number | null;
  /** Follow-up reminders are hidden until this time ("snooze"). */
  snoozed_until: number | null;
  closed_reason: ClosedReason | null;
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
  /** IANA zone of the interviewer (e.g. "America/New_York"); empty when unknown. */
  interviewer_timezone: string;
  notes: string;
  feedback: string;
  outcome: InterviewOutcome;
  status: InterviewStatus;
  created_at: number;
  updated_at: number;
}

export type ApplicationEventType =
  | "status_change"
  | "interview_scheduled"
  | "interview_completed"
  | "message_sent"
  | "note";

export type MessageKind = "follow_up" | "thank_you" | "withdraw" | "accept";

export interface ApplicationEventPayload {
  interview_id?: string;
  interview_type?: InterviewType;
  message_kind?: MessageKind;
  closed_reason?: ClosedReason;
}

export interface ApplicationEvent {
  id: string;
  application_id: string;
  type: ApplicationEventType;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  payload: ApplicationEventPayload;
  created_at: number;
}
