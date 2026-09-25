/** Minimal RFC 5545 builder for a single interview event (.ics). */

export interface IcsEventInput {
  uid: string;
  start: number;
  durationMinutes: number;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
  /** Minutes before start for a display alarm; omitted when undefined. */
  alarmMinutesBefore?: number;
  now?: number;
}

function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 chars (continuation lines start with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export function buildInterviewIcs(input: IcsEventInput): string {
  const end = input.start + input.durationMinutes * 60 * 1000;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Joseador Remoto//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@joseador-remoto`,
    `DTSTAMP:${formatUtc(input.now ?? Date.now())}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  if (input.alarmMinutesBefore !== undefined) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(input.summary)}`,
      `TRIGGER:-PT${input.alarmMinutesBefore}M`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
