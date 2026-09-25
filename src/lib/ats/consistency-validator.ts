import type { ParsedCv } from "@/types/cv";
import type { CheckerResult } from "./types";
import type { AtsIssue } from "@/types/ats";

// ---------------------------------------------------------------------------
// Date parsing helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
  // Spanish
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, abr: 4, ago: 8, dic: 12,
};

interface ParsedDate {
  year: number;
  month: number; // 0 = unknown
  raw: string;
}

/** Patterns for date formats, with a label for each format type. */
const DATE_PATTERNS: Array<{ pattern: RegExp; format: string; extract: (m: RegExpMatchArray) => ParsedDate | null }> = [
  // "Month Year" — "January 2023", "Jan 2023"
  {
    pattern: /\b([A-Za-záéíóúñ]+)\s+(\d{4})\b/g,
    format: "Month Year",
    extract: (m) => {
      const monthNum = MONTH_NAMES[m[1].toLowerCase()];
      if (!monthNum) return null;
      return { year: parseInt(m[2], 10), month: monthNum, raw: m[0] };
    },
  },
  // "MM/YYYY" or "MM-YYYY"
  {
    pattern: /\b(\d{1,2})[/\-](\d{4})\b/g,
    format: "MM/YYYY",
    extract: (m) => {
      const month = parseInt(m[1], 10);
      const year = parseInt(m[2], 10);
      if (month < 1 || month > 12 || year < 1950 || year > 2100) return null;
      return { year, month, raw: m[0] };
    },
  },
  // "YYYY-MM" (ISO-ish)
  {
    pattern: /\b(\d{4})[/\-](\d{1,2})\b/g,
    format: "YYYY-MM",
    extract: (m) => {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      if (month < 1 || month > 12 || year < 1950 || year > 2100) return null;
      return { year, month, raw: m[0] };
    },
  },
  // "YYYY" alone (year only)
  {
    pattern: /\b((?:19|20)\d{2})\b/g,
    format: "Year",
    extract: (m) => {
      const year = parseInt(m[1], 10);
      if (year < 1950 || year > 2100) return null;
      return { year, month: 0, raw: m[0] };
    },
  },
];

interface ExtractedDate extends ParsedDate {
  format: string;
}

function extractAllDates(text: string): ExtractedDate[] {
  const results: ExtractedDate[] = [];
  const seen = new Set<string>(); // avoid duplicates from overlapping patterns

  for (const { pattern, format, extract } of DATE_PATTERNS) {
    // Reset lastIndex for global regex
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const parsed = extract(m);
      if (parsed && !seen.has(m[0])) {
        seen.add(m[0]);
        results.push({ ...parsed, format });
      }
    }
  }

  return results;
}

/** Parse a date string from parsedCv (experience/education) into year+month. */
function parseCvDate(dateStr: string): { year: number; month: number } | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim().toLowerCase();

  if (trimmed === "present" || trimmed === "current" || trimmed === "actual" || trimmed === "actualidad") {
    return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  }

  // Try "Month Year"
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (trimmed.includes(name)) {
      const yearMatch = trimmed.match(/\d{4}/);
      if (yearMatch) {
        return { year: parseInt(yearMatch[0], 10), month: num };
      }
    }
  }

  // Try "YYYY-MM" or "MM/YYYY"
  const isoMatch = trimmed.match(/(\d{4})[/\-](\d{1,2})/);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1], 10), month: parseInt(isoMatch[2], 10) };
  }
  const slashMatch = trimmed.match(/(\d{1,2})[/\-](\d{4})/);
  if (slashMatch) {
    return { year: parseInt(slashMatch[2], 10), month: parseInt(slashMatch[1], 10) };
  }

  // Just a year
  const yearOnly = trimmed.match(/((?:19|20)\d{2})/);
  if (yearOnly) {
    return { year: parseInt(yearOnly[1], 10), month: 1 };
  }

  return null;
}

function toMonths(d: { year: number; month: number }): number {
  return d.year * 12 + d.month;
}

// ---------------------------------------------------------------------------
// validateConsistency
// ---------------------------------------------------------------------------

export function validateConsistency(
  rawText: string,
  parsedCv: ParsedCv,
): CheckerResult {
  const issues: AtsIssue[] = [];
  let score = 100;
  const details: Record<string, unknown> = {};

  // ---- 1. Date format consistency ----
  const allDates = extractAllDates(rawText);
  // Filter out standalone "Year" entries that might just be numbers
  const specificDates = allDates.filter((d) => d.format !== "Year");

  if (specificDates.length >= 2) {
    const formatCounts = new Map<string, number>();
    for (const d of specificDates) {
      formatCounts.set(d.format, (formatCounts.get(d.format) ?? 0) + 1);
    }

    if (formatCounts.size > 1) {
      const formats = [...formatCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([fmt, count]) => `${fmt} (${count}x)`);

      issues.push({
        check: "consistency",
        severity: "warning",
        message: `Inconsistent date formats detected: ${formats.join(", ")}.`,
        fix: "Use one consistent date format throughout (recommended: 'Month Year', e.g., 'January 2023').",
      });
      score -= 10;
      details.dateFormats = Object.fromEntries(formatCounts);
    } else {
      details.dateFormats = Object.fromEntries(formatCounts);
    }
  }

  details.totalDatesFound = allDates.length;

  // ---- 2. Timeline gaps ----
  if (parsedCv.experience.length >= 2) {
    // Build timeline entries sorted by start date
    const timeline: Array<{
      label: string;
      start: { year: number; month: number };
      end: { year: number; month: number };
    }> = [];

    for (const exp of parsedCv.experience) {
      const start = parseCvDate(exp.start_date);
      const endDate = exp.end_date ? parseCvDate(exp.end_date) : parseCvDate("present");
      if (start && endDate) {
        timeline.push({
          label: exp.company || exp.title || "Unknown",
          start,
          end: endDate,
        });
      }
    }

    // Sort by start date descending (most recent first)
    timeline.sort((a, b) => toMonths(b.start) - toMonths(a.start));

    const gaps: Array<{ months: number; between: string }> = [];

    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1]; // older entry
      const gapMonths = toMonths(current.start) - toMonths(next.end);

      if (gapMonths > 6) {
        gaps.push({
          months: gapMonths,
          between: `${next.label} → ${current.label}`,
        });
      }
    }

    if (gaps.length > 0) {
      for (const gap of gaps.slice(0, 3)) {
        const severity = gap.months > 12 ? "warning" : "info";
        issues.push({
          check: "consistency",
          severity,
          message: `${gap.months}-month employment gap between ${gap.between}.`,
          fix: gap.months > 12
            ? "Consider adding an explanation for this gap (freelancing, education, personal projects, etc.)."
            : "Minor gap — consider if it's worth addressing with freelance work or learning activities.",
        });
        score -= gap.months > 12 ? 8 : 3;
      }
      details.timelineGaps = gaps;
    }
  }

  // ---- 3. Chronological order ----
  if (parsedCv.experience.length >= 2) {
    const startDates: Array<{ label: string; months: number }> = [];

    for (const exp of parsedCv.experience) {
      const start = parseCvDate(exp.start_date);
      if (start) {
        startDates.push({
          label: exp.company || exp.title || "Unknown",
          months: toMonths(start),
        });
      }
    }

    if (startDates.length >= 2) {
      let isReverseChronological = true;
      for (let i = 1; i < startDates.length; i++) {
        if (startDates[i].months > startDates[i - 1].months) {
          isReverseChronological = false;
          break;
        }
      }

      if (!isReverseChronological) {
        issues.push({
          check: "consistency",
          severity: "warning",
          message: "Experience entries are not in reverse-chronological order (most recent first).",
          fix: "Reorder your experience section so the most recent position appears first.",
        });
        score -= 8;
        details.chronologicalOrder = false;
      } else {
        details.chronologicalOrder = true;
      }
    }
  }

  // ---- 4. Bullet style consistency ----
  const bulletPatterns: Array<{ char: string; pattern: RegExp }> = [
    { char: "•", pattern: /^\s*•/gm },
    { char: "-", pattern: /^\s*-\s/gm },
    { char: "*", pattern: /^\s*\*\s/gm },
    { char: "·", pattern: /^\s*·/gm },
    { char: "►", pattern: /^\s*[►▶→➤➜➡]/gm },
    { char: "numbered", pattern: /^\s*\d+[.)]\s/gm },
  ];

  const bulletCounts = new Map<string, number>();
  for (const bp of bulletPatterns) {
    const matches = rawText.match(bp.pattern);
    if (matches && matches.length > 0) {
      bulletCounts.set(bp.char, matches.length);
    }
  }

  if (bulletCounts.size > 2) {
    const styles = [...bulletCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([char, count]) => `"${char}" (${count}x)`);

    issues.push({
      check: "consistency",
      severity: "info",
      message: `Mixed bullet styles detected: ${styles.join(", ")}.`,
      fix: "Use one consistent bullet style throughout (• or - are the most ATS-friendly).",
    });
    score -= 5;
    details.bulletStyles = Object.fromEntries(bulletCounts);
  } else if (bulletCounts.size > 0) {
    details.bulletStyles = Object.fromEntries(bulletCounts);
  }

  // ---- 5. Tense consistency in experience descriptions ----
  // Current role should use present tense, past roles should use past tense
  if (parsedCv.experience.length > 0) {
    const currentRole = parsedCv.experience.find(
      (e) =>
        !e.end_date ||
        e.end_date.toLowerCase() === "present" ||
        e.end_date.toLowerCase() === "current" ||
        e.end_date.toLowerCase() === "actual" ||
        e.end_date.toLowerCase() === "actualidad",
    );

    if (currentRole) {
      const desc = (currentRole.description + " " + currentRole.achievements.join(" ")).toLowerCase();
      // Check if past tense verbs dominate in current role description
      const pastTensePattern = /\b(managed|developed|created|designed|implemented|built|led|improved|reduced|achieved|delivered|launched|established)\b/gi;
      const presentTensePattern = /\b(manage|develop|create|design|implement|build|lead|improve|reduce|achieve|deliver|launch|establish)\b/gi;

      const pastMatches = desc.match(pastTensePattern) ?? [];
      const presentMatches = desc.match(presentTensePattern) ?? [];

      if (pastMatches.length > 3 && presentMatches.length === 0) {
        issues.push({
          check: "consistency",
          severity: "info",
          message: "Current role description uses past tense. Current roles typically use present tense.",
          fix: "Use present tense for your current role (e.g., 'Develop' instead of 'Developed').",
        });
        score -= 3;
        details.currentRoleTense = "past";
      }
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    details,
  };
}
