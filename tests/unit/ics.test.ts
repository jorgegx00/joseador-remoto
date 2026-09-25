import { describe, it, expect } from "vitest";
import { buildInterviewIcs, escapeIcsText } from "@/lib/applications/ics";

describe("buildInterviewIcs", () => {
  const ics = buildInterviewIcs({
    uid: "01ABC",
    start: Date.UTC(2026, 9, 1, 14, 30),
    durationMinutes: 45,
    summary: "Technical — Acme, Inc.",
    description: "Line one\nLine two; with semicolon",
    url: "https://meet.example.com/xyz",
    alarmMinutesBefore: 60,
    now: Date.UTC(2026, 8, 25, 0, 0),
  });

  it("emits UTC start/end and CRLF line endings", () => {
    expect(ics).toContain("DTSTART:20261001T143000Z\r\n");
    expect(ics).toContain("DTEND:20261001T151500Z\r\n");
    expect(ics).toContain("DTSTAMP:20260925T000000Z\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes text values", () => {
    expect(ics).toContain("SUMMARY:Technical — Acme\\, Inc.");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\; with semicolon");
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
  });

  it("includes an alarm", () => {
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  it("folds long lines", () => {
    const long = buildInterviewIcs({ uid: "x", start: 0, durationMinutes: 30, summary: "x".repeat(200), now: 0 });
    for (const line of long.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});
