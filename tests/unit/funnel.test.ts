import { describe, it, expect } from "vitest";
import { computeFunnelRates } from "@/lib/applications/funnel";
import type { Application, ApplicationStatus, ClosedReason } from "@/types";

function app(id: string, status: ApplicationStatus, closed_reason: ClosedReason | null = null): Application {
  return {
    id,
    job_id: "j",
    cv_id: "c",
    generated_cv_id: null,
    status,
    applied_at: 1,
    notes: "",
    last_contact_at: null,
    snoozed_until: null,
    closed_reason,
    created_at: 1,
    updated_at: 1,
  };
}

describe("computeFunnelRates", () => {
  it("returns null with too few applications", () => {
    expect(computeFunnelRates([app("a", "applied")], [])).toBeNull();
  });

  it("counts rejections as replies but not ghosting", () => {
    const apps = [
      app("1", "applied"),
      app("2", "applied"),
      app("3", "technical"),
      app("4", "rejected"),
      app("5", "rejected", "ghosted"),
      app("6", "saved"),
    ];
    const r = computeFunnelRates(apps, [])!;
    expect(r.sent).toBe(5);
    expect(r.responseRate).toBeCloseTo(2 / 5);
    expect(r.interviewRate).toBeCloseTo(1 / 5);
  });
});
