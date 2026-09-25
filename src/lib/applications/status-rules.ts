import type { ApplicationStatus, InterviewType } from "@/types";

/** Forward order of the pipeline. Terminal "rejected"/"withdrawn" sit outside it. */
const PIPELINE_ORDER: ApplicationStatus[] = [
  "saved",
  "applied",
  "phone_screen",
  "interviewing",
  "technical",
  "final",
  "offered",
  "accepted",
];

const INTERVIEW_TYPE_STATUS: Record<InterviewType, ApplicationStatus> = {
  phone_screen: "phone_screen",
  behavioral: "interviewing",
  hiring_manager: "interviewing",
  technical: "technical",
  system_design: "technical",
  take_home: "technical",
  final: "final",
};

/** Statuses that are still waiting on the company (follow-ups make sense). */
export const ACTIVE_STATUSES: ApplicationStatus[] = [
  "applied",
  "phone_screen",
  "interviewing",
  "technical",
  "final",
];

export function isClosedStatus(status: ApplicationStatus): boolean {
  return status === "rejected" || status === "withdrawn" || status === "accepted";
}

function rank(status: ApplicationStatus): number {
  return PIPELINE_ORDER.indexOf(status);
}

export function isForwardMove(from: ApplicationStatus, to: ApplicationStatus): boolean {
  const a = rank(from);
  const b = rank(to);
  return a !== -1 && b !== -1 && b > a;
}

/**
 * Status an application should move to once a round of `type` is scheduled, or null
 * to leave it alone. Only ever advances: a technical round scheduled on an application
 * already in "final" (or offered, rejected…) never drags it backwards.
 */
export function statusAfterScheduling(
  current: ApplicationStatus,
  type: InterviewType,
): ApplicationStatus | null {
  const target = INTERVIEW_TYPE_STATUS[type];
  return isForwardMove(current, target) ? target : null;
}
