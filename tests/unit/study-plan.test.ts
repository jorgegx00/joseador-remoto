import { describe, it, expect } from "vitest";
import {
  isPlanOutdated,
  localDateKey,
  normalizePlan,
  planWindow,
  sourceStamp,
  tasksForDate,
  type StampParts,
  type StudyPlanDoc,
} from "@/lib/applications/study-plan";
import { buildQuickPlanPrompt, type QuickPlanInput } from "@/lib/llm/prep-prompts";
import { quickPlanSchema, type QuickPlan } from "@/lib/llm/prep-schemas";
import { sampleParsedCv } from "../fixtures/sample-cv";
import { sampleJob } from "../fixtures/sample-job";

// Local-time helpers so tests hold in any TZ.
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 9, 25, 9);

describe("planWindow", () => {
  it("returns null for past interviews", () => {
    expect(planWindow(NOW, NOW - 1000)).toBeNull();
  });

  it("same-day interview: a single block for today", () => {
    const w = planWindow(NOW, at(2026, 9, 25, 16))!;
    expect(w.mode).toBe("same_day");
    expect(w.dates).toEqual(["2026-09-25"]);
    expect(w.daysUntil).toBe(0);
  });

  it("phone screen in 2 days → today and tomorrow", () => {
    const w = planWindow(NOW, at(2026, 9, 27, 10))!;
    expect(w.mode).toBe("days");
    expect(w.dates).toEqual(["2026-09-25", "2026-09-26"]);
    expect(w.startsLater).toBe(false);
  });

  it("technical in 4 days → 4 plan days, interview day excluded", () => {
    const w = planWindow(NOW, at(2026, 9, 29, 8))!;
    expect(w.dates).toEqual(["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]);
  });

  it("more than 7 days away → last 7 days only", () => {
    const w = planWindow(NOW, at(2026, 10, 10, 10))!;
    expect(w.dates).toHaveLength(7);
    expect(w.dates[0]).toBe("2026-10-03");
    expect(w.dates[6]).toBe("2026-10-09");
    expect(w.startsLater).toBe(true);
  });

  it("uses calendar days across a DST change", () => {
    // Ranges spanning early November / late March cover the common DST switches.
    const w = planWindow(at(2026, 10, 30, 9), at(2026, 11, 3, 9))!;
    expect(w.dates).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    const w2 = planWindow(at(2027, 3, 26, 9), at(2027, 3, 30, 9))!;
    expect(w2.dates).toEqual(["2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29"]);
  });
});

const rawPlan = (days: QuickPlan["days"]): QuickPlan => ({
  headline: "h",
  key_messages: ["a", "b", "c"],
  days,
  cheat_sheet: { opener: "o", stories: [], numbers: [], questions_to_ask: [] },
  day_of: ["check link"],
  not_ready: [],
});
const task = (minutes: number) => ({ title: "t", detail: "d", minutes, source: "fit" as const });

describe("normalizePlan", () => {
  const dates = ["2026-09-25", "2026-09-26"];

  it("drops unknown dates, merges duplicates, assigns stable ids and clamps minutes", () => {
    const plan = normalizePlan(
      rawPlan([
        { date: "2026-09-26", focus: "B", tasks: [task(500)] },
        { date: "2026-09-25", focus: "A", tasks: [task(1)] },
        { date: "2026-09-25", focus: "A2", tasks: [task(30)] },
        { date: "2030-01-01", focus: "X", tasks: [task(30)] },
      ]),
      dates,
    );
    expect(plan.days.map((d) => d.date)).toEqual(dates);
    expect(plan.days[0].tasks.map((t) => t.id)).toEqual(["d0t0", "d0t1"]);
    expect(plan.days[0].tasks[0].minutes).toBe(5);
    expect(plan.days[1].tasks[0].minutes).toBe(240);
    expect(plan.days[1].tasks[0].id).toBe("d1t0");
  });

  it("falls back to position when the model ignored the dates", () => {
    const plan = normalizePlan(rawPlan([{ date: "Day 1", focus: "A", tasks: [task(30)] }]), dates);
    expect(plan.days.map((d) => d.date)).toEqual(["2026-09-25"]);
  });
});

describe("stamp and outdated", () => {
  const parts: StampParts = {
    scheduledAt: 1,
    interviewType: "technical",
    budget: 60,
    gapBriefAt: 10,
    roundPackAt: 20,
    interviewPrepAt: null,
    latestStoryAt: null,
    latestMockAt: null,
  };
  const doc = (stamp: string): StudyPlanDoc => ({
    plan: normalizePlan(rawPlan([{ date: "2026-09-25", focus: "A", tasks: [task(30)] }]), ["2026-09-25"]),
    meta: { stamp, budget: 60, dates: ["2026-09-25"], mode: "days", language: "en" },
    progress: {},
  });

  it("changes on reschedule, budget and prep updates", () => {
    const base = sourceStamp(parts);
    expect(sourceStamp({ ...parts, scheduledAt: 2 })).not.toBe(base);
    expect(sourceStamp({ ...parts, budget: 30 })).not.toBe(base);
    expect(sourceStamp({ ...parts, roundPackAt: 21 })).not.toBe(base);
    expect(sourceStamp({ ...parts, latestMockAt: 5 })).not.toBe(base);
  });

  it("flags outdated only when the stamp differs", () => {
    const s = sourceStamp(parts);
    expect(isPlanOutdated(doc(s), s)).toBe(false);
    expect(isPlanOutdated(doc(s), sourceStamp({ ...parts, budget: 120 }))).toBe(true);
    expect(isPlanOutdated(doc(s), null)).toBe(false);
  });

  it("tasksForDate returns the day's tasks", () => {
    const d = doc("x");
    expect(tasksForDate(d, "2026-09-25")).toHaveLength(1);
    expect(tasksForDate(d, "2026-09-26")).toEqual([]);
    expect(localDateKey(NOW)).toBe("2026-09-25");
  });
});

describe("buildQuickPlanPrompt", () => {
  const base: QuickPlanInput = {
    cv: sampleParsedCv,
    job: sampleJob,
    interviewType: "technical",
    interviewAt: "Tuesday 29 September 2026, 08:00",
    mode: "days",
    dates: [
      { date: "2026-09-25", weekday: "Friday" },
      { date: "2026-09-26", weekday: "Saturday" },
    ],
    minutesPerDay: 90,
    stories: [],
    gapBrief: null,
    roundPack: null,
    interviewPrep: null,
    mockReport: null,
    otherRounds: [],
    planLanguage: "es",
    materialLanguage: "en",
  };

  it("includes dates, budget, languages and grounding", () => {
    const { system, prompt } = buildQuickPlanPrompt(base);
    expect(prompt).toContain("- 2026-09-25 (Friday)");
    expect(prompt).toContain("Minutes per day: 90");
    expect(system).toContain("about 90 minutes");
    expect(system).toContain("in Spanish");
    expect(system).toContain("in English, the language of the interview");
    expect(system).toContain("Never invent numbers");
    expect(prompt).not.toContain("<round_pack>");
    expect(prompt).not.toContain("<other_rounds>");
    expect(prompt).not.toContain("<mock_feedback>");
  });

  it("adds available prep material and other rounds", () => {
    const { prompt } = buildQuickPlanPrompt({
      ...base,
      roundPack: {
        focus: "Caching and APIs",
        likely_questions: [{ question: "How would you cache X?", why_asked: "w", answer_outline: [], story: "Billing migration" }],
        questions_to_ask: [{ question: "Team size?", why: "w" }],
        study_plan: [],
        pitfalls: [],
        needs_input: [],
      },
      mockReport: {
        summary: "Solid but vague on results",
        strengths: [],
        recurring_gaps: ["No metrics"],
        stories_to_prepare: [],
        review_topics: [],
      },
      otherRounds: [{ date: "2026-09-26", label: "phone screen interview with Acme" }],
    });
    expect(prompt).toContain("<round_pack>");
    expect(prompt).toContain("How would you cache X? [story: Billing migration]");
    expect(prompt).toContain("Gap: No metrics");
    expect(prompt).toContain("- 2026-09-26: phone screen interview with Acme");
  });

  it("same-day mode asks for one short block", () => {
    const { system } = buildQuickPlanPrompt({ ...base, mode: "same_day", dates: [base.dates[0]] });
    expect(system).toContain("The interview is TODAY");
  });
});

describe("quickPlanSchema", () => {
  it("parses a sample plan and rejects unknown sources", () => {
    const ok = rawPlan([{ date: "2026-09-25", focus: "A", tasks: [task(30)] }]);
    expect(quickPlanSchema.safeParse(ok).success).toBe(true);
    const bad = rawPlan([{ date: "2026-09-25", focus: "A", tasks: [{ ...task(30), source: "youtube" as never }] }]);
    expect(quickPlanSchema.safeParse(bad).success).toBe(false);
  });
});
