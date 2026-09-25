/** Zones most remote LatAm candidates interview with, plus their own. */
export const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Bogota",
  "America/Santo_Domingo",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
] as const;

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Short wall-clock time of `ms` in `timeZone`, e.g. "10:30 a. m. EDT". Null for invalid zones. */
export function formatTimeInZone(ms: number, timeZone: string, locale: string): string | null {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
      timeZoneName: "short",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** "America/Santo_Domingo" → "Santo Domingo". */
export function timezoneLabel(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}
