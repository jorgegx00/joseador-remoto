import { invoke } from "@tauri-apps/api/core";
import { buildInterviewIcs } from "@/lib/applications/ics";
import { sanitizeFileName } from "@/lib/files/sanitize-file-name";
import type { Interview } from "@/types";

/**
 * Asks where to save an .ics for `interview` (importable into Google/Outlook/Apple
 * Calendar). Returns the saved path, or null when the user cancels.
 */
export async function exportInterviewIcs(
  interview: Interview,
  opts: { summary: string; description?: string },
): Promise<string | null> {
  const ics = buildInterviewIcs({
    uid: interview.id,
    start: interview.scheduled_at,
    durationMinutes: interview.duration_minutes,
    summary: opts.summary,
    description: opts.description,
    url: interview.meeting_url || undefined,
    location: interview.location || interview.meeting_url || undefined,
    alarmMinutesBefore: 60,
  });
  return invoke<string | null>("save_binary_file", {
    defaultName: sanitizeFileName(opts.summary, "ics", "interview"),
    filterName: "Calendar",
    extensions: ["ics"],
    contents: Array.from(new TextEncoder().encode(ics)),
  });
}
