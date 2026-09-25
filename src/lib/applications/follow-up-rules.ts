import type { Application, ApplicationEvent, Interview } from "@/types";
import { ACTIVE_STATUSES } from "./status-rules";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of silence before the first follow-up, and between follow-ups. */
export const FOLLOW_UP_AFTER_DAYS = 7;
export const MAX_FOLLOW_UPS = 2;
/** Days of silence after which we suggest (never force) marking as ghosted. */
export const GHOSTED_AFTER_DAYS = 21;
/** A thank-you note stops being useful a few days after the interview. */
export const THANK_YOU_WINDOW_DAYS = 3;
/** Upcoming rounds within this horizon get a "prepare" action. */
export const PREPARE_HORIZON_DAYS = 7;

export type PipelineActionKind =
  | "follow_up"
  | "thank_you"
  | "prepare"
  | "take_home_due"
  | "maybe_ghosted";

export interface PipelineAction {
  kind: PipelineActionKind;
  application_id: string;
  interview_id?: string;
  /** When the action becomes due; before `now` means overdue. */
  due_at: number;
}

export interface FollowUpInput {
  application: Application;
  interviews: Interview[];
  events: ApplicationEvent[];
  now: number;
}

function interviewEnd(i: Interview): number {
  return i.scheduled_at + i.duration_minutes * 60 * 1000;
}

/**
 * Last time the company showed signs of life: the application date, an explicit
 * contact, or the end of a round that already happened. Messages *we* sent do not
 * count — otherwise following up would reset the ghosting clock.
 */
export function lastHeardAt(app: Application, interviews: Interview[], now: number): number {
  let last = app.applied_at ?? app.created_at;
  if (app.last_contact_at) last = Math.max(last, app.last_contact_at);
  for (const i of interviews) {
    if (i.status === "cancelled") continue;
    const end = interviewEnd(i);
    if (end <= now) last = Math.max(last, end);
  }
  return last;
}

/** Suggested next actions for one application. Pure; `now` is injected for tests. */
export function computeActions({ application: app, interviews, events, now }: FollowUpInput): PipelineAction[] {
  const actions: PipelineAction[] = [];
  const own = interviews.filter((i) => i.application_id === app.id && i.status !== "cancelled");
  const isUpcoming = (i: Interview) => (i.status === "scheduled" || i.status === "rescheduled") && i.scheduled_at > now;

  // Interview-driven actions apply whatever the status (an offer can still have a round).
  for (const i of own) {
    if (isUpcoming(i) && i.scheduled_at - now <= PREPARE_HORIZON_DAYS * DAY_MS) {
      actions.push({
        kind: i.interview_type === "take_home" ? "take_home_due" : "prepare",
        application_id: app.id,
        interview_id: i.id,
        due_at: i.scheduled_at,
      });
    }

    const end = interviewEnd(i);
    const thanked = events.some(
      (e) => e.type === "message_sent" && e.payload.message_kind === "thank_you" && e.payload.interview_id === i.id,
    );
    if (
      i.interview_type !== "take_home" &&
      end <= now &&
      now - end <= THANK_YOU_WINDOW_DAYS * DAY_MS &&
      !thanked
    ) {
      actions.push({ kind: "thank_you", application_id: app.id, interview_id: i.id, due_at: end + DAY_MS });
    }
  }

  if (!ACTIVE_STATUSES.includes(app.status)) return actions;
  // Waiting on a round we already have on the calendar is not silence.
  if (own.some(isUpcoming)) return actions;
  if (app.snoozed_until && app.snoozed_until > now) return actions;

  const heard = lastHeardAt(app, own, now);
  const followUps = events
    .filter((e) => e.type === "message_sent" && e.payload.message_kind === "follow_up" && e.created_at > heard)
    .sort((a, b) => a.created_at - b.created_at);

  if (now - heard >= GHOSTED_AFTER_DAYS * DAY_MS) {
    actions.push({ kind: "maybe_ghosted", application_id: app.id, due_at: heard + GHOSTED_AFTER_DAYS * DAY_MS });
    return actions;
  }

  if (followUps.length < MAX_FOLLOW_UPS) {
    const from = followUps.length === 0 ? heard : followUps[followUps.length - 1].created_at;
    const due = from + FOLLOW_UP_AFTER_DAYS * DAY_MS;
    if (due <= now) actions.push({ kind: "follow_up", application_id: app.id, due_at: due });
  }

  return actions;
}

export type ActionBucket = "attention" | "today" | "week";

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Buckets actions for the dashboard: past-due before today ("attention"), due today,
 * or within the next 7 days. Anything further out is dropped. Each bucket is sorted by
 * due date.
 */
export function groupActions(actions: PipelineAction[], now: number): Record<ActionBucket, PipelineAction[]> {
  const today = startOfDay(now);
  const tomorrow = today + DAY_MS;
  const weekEnd = today + 8 * DAY_MS;
  const groups: Record<ActionBucket, PipelineAction[]> = { attention: [], today: [], week: [] };
  for (const a of [...actions].sort((x, y) => x.due_at - y.due_at)) {
    if (a.due_at < today) groups.attention.push(a);
    else if (a.due_at < tomorrow) groups.today.push(a);
    else if (a.due_at < weekEnd) groups.week.push(a);
  }
  return groups;
}

/** Actions for every application at once (events may span all applications). */
export function computeAllActions(
  applications: Application[],
  interviews: Interview[],
  events: ApplicationEvent[],
  now: number,
): PipelineAction[] {
  const eventsByApp = new Map<string, ApplicationEvent[]>();
  for (const e of events) {
    const list = eventsByApp.get(e.application_id);
    if (list) list.push(e);
    else eventsByApp.set(e.application_id, [e]);
  }
  return applications.flatMap((application) =>
    computeActions({ application, interviews, events: eventsByApp.get(application.id) ?? [], now }),
  );
}
