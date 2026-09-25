import { describe, it, expect } from "vitest";
import { computeActions, DAY_MS } from "@/lib/applications/follow-up-rules";
import type { Application, ApplicationEvent, Interview } from "@/types";

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: "app1",
    job_id: "job1",
    cv_id: "cv1",
    generated_cv_id: null,
    status: "applied",
    applied_at: NOW - 3 * DAY_MS,
    notes: "",
    last_contact_at: null,
    snoozed_until: null,
    closed_reason: null,
    created_at: NOW - 10 * DAY_MS,
    updated_at: NOW,
    ...overrides,
  };
}

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: "int1",
    application_id: "app1",
    scheduled_at: NOW + DAY_MS,
    duration_minutes: 60,
    interview_type: "technical",
    location: "",
    meeting_url: "",
    interviewer_name: "",
    interviewer_role: "",
    interviewer_timezone: "",
    notes: "",
    feedback: "",
    outcome: "pending",
    status: "scheduled",
    created_at: NOW - DAY_MS,
    updated_at: NOW - DAY_MS,
    ...overrides,
  };
}

function sent(kind: "follow_up" | "thank_you", at: number, interviewId?: string): ApplicationEvent {
  return {
    id: `e${at}`,
    application_id: "app1",
    type: "message_sent",
    from_status: null,
    to_status: null,
    payload: { message_kind: kind, ...(interviewId ? { interview_id: interviewId } : {}) },
    created_at: at,
  };
}

const kinds = (a: ReturnType<typeof computeActions>) => a.map((x) => x.kind);

describe("computeActions — follow-ups", () => {
  it("nothing to do shortly after applying", () => {
    expect(computeActions({ application: app(), interviews: [], events: [], now: NOW })).toEqual([]);
  });

  it("suggests a follow-up after 7 days of silence", () => {
    const actions = computeActions({
      application: app({ applied_at: NOW - 8 * DAY_MS }),
      interviews: [],
      events: [],
      now: NOW,
    });
    expect(kinds(actions)).toEqual(["follow_up"]);
    expect(actions[0].due_at).toBe(NOW - DAY_MS);
  });

  it("waits 7 days after the first follow-up and stops after two", () => {
    const applied = NOW - 16 * DAY_MS;
    const one = computeActions({
      application: app({ applied_at: applied }),
      interviews: [],
      events: [sent("follow_up", NOW - 3 * DAY_MS)],
      now: NOW,
    });
    expect(one).toEqual([]);

    const two = computeActions({
      application: app({ applied_at: applied }),
      interviews: [],
      events: [sent("follow_up", NOW - 9 * DAY_MS), sent("follow_up", NOW - 8 * DAY_MS)],
      now: NOW,
    });
    expect(two).toEqual([]);
  });

  it("follow-ups we sent do not reset the ghosting clock", () => {
    const actions = computeActions({
      application: app({ applied_at: NOW - 22 * DAY_MS }),
      interviews: [],
      events: [sent("follow_up", NOW - 2 * DAY_MS)],
      now: NOW,
    });
    expect(kinds(actions)).toEqual(["maybe_ghosted"]);
  });

  it("company contact resets the clock", () => {
    const actions = computeActions({
      application: app({ applied_at: NOW - 30 * DAY_MS, last_contact_at: NOW - 2 * DAY_MS }),
      interviews: [],
      events: [],
      now: NOW,
    });
    expect(actions).toEqual([]);
  });

  it("respects snooze and closed statuses", () => {
    const old = { applied_at: NOW - 10 * DAY_MS };
    expect(computeActions({ application: app({ ...old, snoozed_until: NOW + DAY_MS }), interviews: [], events: [], now: NOW })).toEqual([]);
    expect(computeActions({ application: app({ ...old, status: "rejected" }), interviews: [], events: [], now: NOW })).toEqual([]);
    expect(computeActions({ application: app({ ...old, status: "saved" }), interviews: [], events: [], now: NOW })).toEqual([]);
  });

  it("no follow-up while a round is on the calendar", () => {
    const actions = computeActions({
      application: app({ applied_at: NOW - 10 * DAY_MS, status: "technical" }),
      interviews: [interview({ scheduled_at: NOW + 10 * DAY_MS })],
      events: [],
      now: NOW,
    });
    expect(actions).toEqual([]);
  });
});

describe("computeActions — interviews", () => {
  it("prepare for rounds within a week, take-home deadlines separately", () => {
    const actions = computeActions({
      application: app({ status: "technical" }),
      interviews: [
        interview({ id: "a", scheduled_at: NOW + 2 * DAY_MS }),
        interview({ id: "b", interview_type: "take_home", scheduled_at: NOW + 3 * DAY_MS }),
        interview({ id: "c", scheduled_at: NOW + 9 * DAY_MS }),
      ],
      events: [],
      now: NOW,
    });
    expect(actions.map((a) => [a.kind, a.interview_id])).toEqual([
      ["prepare", "a"],
      ["take_home_due", "b"],
    ]);
  });

  it("thank-you within 3 days of a round, unless already sent", () => {
    const past = interview({ scheduled_at: NOW - 5 * 60 * 60 * 1000 });
    const actions = computeActions({ application: app({ status: "technical" }), interviews: [past], events: [], now: NOW });
    expect(kinds(actions)).toEqual(["thank_you"]);

    const done = computeActions({
      application: app({ status: "technical" }),
      interviews: [past],
      events: [sent("thank_you", NOW - 60 * 60 * 1000, past.id)],
      now: NOW,
    });
    expect(done).toEqual([]);

    const stale = computeActions({
      application: app({ status: "technical" }),
      interviews: [interview({ scheduled_at: NOW - 5 * DAY_MS })],
      events: [],
      now: NOW,
    });
    expect(kinds(stale)).not.toContain("thank_you");
  });

  it("a finished round counts as contact", () => {
    const actions = computeActions({
      application: app({ applied_at: NOW - 30 * DAY_MS, status: "technical" }),
      interviews: [interview({ scheduled_at: NOW - 4 * DAY_MS, status: "completed" })],
      events: [],
      now: NOW,
    });
    expect(kinds(actions)).toEqual([]);
  });

  it("ignores cancelled rounds", () => {
    const actions = computeActions({
      application: app({ status: "technical" }),
      interviews: [interview({ status: "cancelled", scheduled_at: NOW + DAY_MS })],
      events: [],
      now: NOW,
    });
    expect(actions).toEqual([]);
  });
});

describe("groupActions", () => {
  it("buckets by due date relative to the local day", async () => {
    const { groupActions } = await import("@/lib/applications/follow-up-rules");
    const start = new Date(NOW);
    start.setHours(0, 0, 0, 0);
    const today = start.getTime();
    const mk = (due_at: number) => ({ kind: "follow_up" as const, application_id: "a", due_at });
    const g = groupActions([mk(today + 2 * DAY_MS), mk(today - 1), mk(today + 60_000), mk(today + 30 * DAY_MS)], NOW);
    expect(g.attention.map((a) => a.due_at)).toEqual([today - 1]);
    expect(g.today.map((a) => a.due_at)).toEqual([today + 60_000]);
    expect(g.week.map((a) => a.due_at)).toEqual([today + 2 * DAY_MS]);
  });
});
