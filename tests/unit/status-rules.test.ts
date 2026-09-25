import { describe, it, expect } from "vitest";
import { isForwardMove, statusAfterScheduling } from "@/lib/applications/status-rules";

describe("statusAfterScheduling", () => {
  it("advances saved/applied applications to the round's stage", () => {
    expect(statusAfterScheduling("applied", "phone_screen")).toBe("phone_screen");
    expect(statusAfterScheduling("saved", "technical")).toBe("technical");
    expect(statusAfterScheduling("phone_screen", "take_home")).toBe("technical");
    expect(statusAfterScheduling("technical", "final")).toBe("final");
    expect(statusAfterScheduling("applied", "hiring_manager")).toBe("interviewing");
  });

  it("never moves backwards", () => {
    expect(statusAfterScheduling("final", "technical")).toBeNull();
    expect(statusAfterScheduling("technical", "phone_screen")).toBeNull();
    expect(statusAfterScheduling("offered", "final")).toBeNull();
    expect(statusAfterScheduling("phone_screen", "phone_screen")).toBeNull();
  });

  it("leaves closed applications alone", () => {
    expect(statusAfterScheduling("rejected", "technical")).toBeNull();
    expect(statusAfterScheduling("withdrawn", "phone_screen")).toBeNull();
  });
});

describe("isForwardMove", () => {
  it("treats terminal statuses as outside the pipeline", () => {
    expect(isForwardMove("applied", "rejected")).toBe(false);
    expect(isForwardMove("applied", "offered")).toBe(true);
  });
});
