import type { Application, ApplicationStatus, Interview } from "@/types";

/**
 * Rough market reference points (2025 job-search surveys): about 1 in 4 applications
 * get any reply and ~3% reach an interview. Used only as a neutral comparison.
 */
export const BENCHMARK_RESPONSE_RATE = 0.25;
export const BENCHMARK_INTERVIEW_RATE = 0.03;
/** Below this many sent applications the rates are noise; don't show them. */
export const MIN_APPLICATIONS_FOR_RATES = 5;

const INTERVIEW_STAGES: ApplicationStatus[] = [
  "phone_screen",
  "interviewing",
  "technical",
  "final",
  "offered",
  "accepted",
];

export interface FunnelRates {
  sent: number;
  responseRate: number;
  interviewRate: number;
}

export function computeFunnelRates(applications: Application[], interviews: Interview[]): FunnelRates | null {
  const sent = applications.filter((a) => a.status !== "saved");
  if (sent.length < MIN_APPLICATIONS_FOR_RATES) return null;
  const withInterview = new Set(interviews.filter((i) => i.status !== "cancelled").map((i) => i.application_id));
  const interviewed = sent.filter((a) => INTERVIEW_STAGES.includes(a.status) || withInterview.has(a.id));
  // An explicit rejection is still a reply; silence closed as "ghosted" is not.
  const replied = sent.filter(
    (a) =>
      interviewed.includes(a) ||
      a.last_contact_at !== null ||
      (a.status === "rejected" && a.closed_reason !== "ghosted"),
  );
  return {
    sent: sent.length,
    responseRate: replied.length / sent.length,
    interviewRate: interviewed.length / sent.length,
  };
}
