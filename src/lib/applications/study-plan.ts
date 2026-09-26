import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import type { PlanSource, QuickPlan } from "@/lib/llm/prep-schemas";

/** Plans cover at most this many days before the interview. */
export const MAX_PLAN_DAYS = 7;
export const BUDGET_OPTIONS = [30, 60, 120, 180] as const;
export const DEFAULT_BUDGET = 60;

export function localDateKey(ms: number): string {
  return format(new Date(ms), "yyyy-MM-dd");
}

export interface PlanWindow {
  /** Local dates (YYYY-MM-DD) the plan covers, in order. */
  dates: string[];
  /** "same_day": the interview is today — one short block before it. */
  mode: "days" | "same_day";
  /** Whole calendar days until the interview. */
  daysUntil: number;
  /** The interview is further out than MAX_PLAN_DAYS; the plan starts later. */
  startsLater: boolean;
}

/** Dates from today up to the day before the interview (last `maxDays` only). Null when past. */
export function planWindow(now: number, scheduledAt: number, maxDays = MAX_PLAN_DAYS): PlanWindow | null {
  if (scheduledAt <= now) return null;
  const daysUntil = differenceInCalendarDays(scheduledAt, now);
  if (daysUntil <= 0) {
    return { dates: [localDateKey(now)], mode: "same_day", daysUntil: 0, startsLater: false };
  }
  const today = startOfDay(now);
  const first = Math.max(0, daysUntil - maxDays);
  const dates: string[] = [];
  for (let d = first; d < daysUntil; d++) dates.push(format(addDays(today, d), "yyyy-MM-dd"));
  return { dates, mode: "days", daysUntil, startsLater: first > 0 };
}

export interface PlanTask {
  id: string;
  title: string;
  detail: string;
  minutes: number;
  source: PlanSource;
}

export interface PlanDay {
  date: string;
  focus: string;
  tasks: PlanTask[];
}

export type NormalizedPlan = Omit<QuickPlan, "days"> & { days: PlanDay[] };

export interface StudyPlanMeta {
  stamp: string;
  budget: number;
  dates: string[];
  mode: PlanWindow["mode"];
  language: "en" | "es";
}

export interface StudyPlanDoc {
  plan: NormalizedPlan;
  meta: StudyPlanMeta;
  /** Task id → done. Reset when the plan is regenerated. */
  progress: Record<string, boolean>;
}

/**
 * Keeps only the allowed dates (models sometimes drift), falls back to position when no
 * date matches, assigns stable task ids and clamps time boxes.
 */
export function normalizePlan(raw: QuickPlan, dates: string[]): NormalizedPlan {
  const allowed = new Set(dates);
  let days = raw.days.filter((d) => allowed.has(d.date));
  if (days.length === 0 && raw.days.length > 0) {
    days = raw.days.slice(0, dates.length).map((d, i) => ({ ...d, date: dates[i] }));
  }
  const byDate = new Map<string, QuickPlan["days"][number]>();
  for (const d of days) {
    const existing = byDate.get(d.date);
    byDate.set(d.date, existing ? { ...existing, tasks: [...existing.tasks, ...d.tasks] } : d);
  }
  const normalized: PlanDay[] = dates
    .filter((date) => byDate.has(date))
    .map((date) => {
      const d = byDate.get(date)!;
      const index = dates.indexOf(date);
      return {
        date,
        focus: d.focus,
        tasks: d.tasks.map((task, j) => ({
          id: `d${index}t${j}`,
          title: task.title,
          detail: task.detail,
          minutes: Math.min(240, Math.max(5, Math.round(task.minutes || 0))),
          source: task.source,
        })),
      };
    });
  return { ...raw, days: normalized };
}

/** Everything that, when changed, makes a stored plan outdated. */
export interface StampParts {
  scheduledAt: number;
  interviewType: string;
  budget: number;
  gapBriefAt: number | null;
  roundPackAt: number | null;
  interviewPrepAt: number | null;
  latestStoryAt: number | null;
  latestMockAt: number | null;
}

export function sourceStamp(p: StampParts): string {
  return [
    p.scheduledAt,
    p.interviewType,
    p.budget,
    p.gapBriefAt ?? 0,
    p.roundPackAt ?? 0,
    p.interviewPrepAt ?? 0,
    p.latestStoryAt ?? 0,
    p.latestMockAt ?? 0,
  ].join("|");
}

/**
 * A stored plan is outdated when its inputs changed (the stamp includes the interview
 * time, so reschedules are caught). Days simply passing does not outdate it: past days
 * collapse and on the interview day the day-of checklist takes over.
 */
export function isPlanOutdated(doc: StudyPlanDoc, currentStamp: string | null): boolean {
  return currentStamp !== null && doc.meta.stamp !== currentStamp;
}

export function tasksForDate(doc: StudyPlanDoc, date: string): PlanTask[] {
  return doc.plan.days.find((d) => d.date === date)?.tasks ?? [];
}
