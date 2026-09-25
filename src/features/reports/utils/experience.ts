/**
 * Seniority + required-experience line for the report, e.g.
 * "Senior — 5+ años de experiencia". Years come from a regex sweep of the
 * description; the Spanish level label comes from the stored seniority or,
 * failing that, is derived from the years found.
 */

import type { SeniorityLevel } from "@/types";

const LEVEL_ES: Record<SeniorityLevel, string> = {
  junior: "Junior",
  mid: "Semi-senior",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
};

const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:years?|años?|anos?)\b/gi;
const CONTEXT_RE = /experien|relevant|professional|profesional|trabajando|working/i;

/** Max years figure mentioned near an "experience" cue, or null. */
export function extractExperienceYears(description: string): number | null {
  let best: number | null = null;
  for (const match of description.matchAll(YEARS_RE)) {
    const idx = match.index ?? 0;
    const windowStart = Math.max(0, idx - 60);
    const windowEnd = Math.min(description.length, idx + match[0].length + 60);
    if (!CONTEXT_RE.test(description.slice(windowStart, windowEnd))) continue;
    const years = Number.parseInt(match[1], 10);
    if (years > 0 && years <= 20 && (best === null || years > best)) best = years;
  }
  return best;
}

function levelFromYears(years: number): string {
  if (years <= 2) return LEVEL_ES.junior;
  if (years <= 4) return LEVEL_ES.mid;
  return LEVEL_ES.senior;
}

/**
 * Spanish "Nivel" line. `seniority` may be null/undefined for rows that
 * predate the level inference.
 */
export function formatLevel(
  seniority: SeniorityLevel | null | undefined,
  description: string
): string {
  const years = extractExperienceYears(description);
  const label = seniority ? LEVEL_ES[seniority] : years !== null ? levelFromYears(years) : null;
  if (label && years !== null) return `${label} — ${years}+ años de experiencia`;
  if (label) return label;
  return "No especificado";
}

export function seniorityLabelEs(seniority: SeniorityLevel | null | undefined): string | null {
  return seniority ? LEVEL_ES[seniority] : null;
}
