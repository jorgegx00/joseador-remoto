/**
 * Pass 1 of the LLM CV parser: split the numbered lines into sections, and the
 * experience / education / projects sections into entries. The model only returns
 * line numbers; code validates them and falls back to a layout heuristic.
 */

import { z } from "zod";
import { canonicalSectionType } from "@/lib/cv/section-aliases";
import { renderLines, type ParseLine } from "./lines";

export const SECTION_KINDS = [
  "contact",
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "languages",
  "other",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** Sections whose content is a list of entries (one per job / degree / project). */
export const ENTRY_KINDS: ReadonlySet<SectionKind> = new Set(["experience", "education", "projects"]);

const rangeSchema = z.object({
  start_line: z.number().int().describe("First line number of the entry"),
  end_line: z.number().int().describe("Last line number of the entry"),
});

export const segmentationSchema = z.object({
  sections: z
    .array(
      z.object({
        kind: z.enum(SECTION_KINDS),
        heading_line: z
          .number()
          .int()
          .nullable()
          .describe("Line number of the section heading, or null when the section has none (contact block)"),
        start_line: z.number().int().describe("First line of the section (its heading line when it has one)"),
        end_line: z.number().int().describe("Last line of the section"),
        entries: z
          .array(rangeSchema)
          .describe("For experience, education and projects: one range per job, degree or project. Otherwise []"),
      }),
    )
    .describe("All sections in document order, covering every line"),
});

export type Segmentation = z.infer<typeof segmentationSchema>;
export type Section = Segmentation["sections"][number];

// ---------------------------------------------------------------------------
// Heuristic segmentation (hint for the model, fallback when it fails)
// ---------------------------------------------------------------------------

function isBody(line: ParseLine): boolean {
  return line.tags.includes("BULLET") || line.tags.includes("INDENT");
}

/**
 * Splits an entry section's lines into entries: extra vertical space, or a return to
 * the margin after bullets when a date follows within the next lines, starts one.
 */
export function heuristicEntries(lines: ParseLine[]): Array<{ start_line: number; end_line: number }> {
  const entries: Array<{ start_line: number; end_line: number }> = [];
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const dateSoon = lines.slice(i, i + 3).some((l) => !isBody(l) && l.tags.includes("DATE"));
    const starts =
      entries.length === 0 ||
      (!isBody(line) && (line.tags.includes("GAP") || (prev !== undefined && isBody(prev) && dateSoon)));
    if (starts) entries.push({ start_line: line.n, end_line: line.n });
    else entries[entries.length - 1].end_line = line.n;
  });
  return entries;
}

export function heuristicSegmentation(lines: ParseLine[]): Segmentation {
  const sections: Section[] = [];
  lines.forEach((line, i) => {
    const kind = line.tags.includes("H") ? canonicalSectionType(line.text) : null;
    // An unknown heading-like line is a section ("Awards") only when it is short and
    // no date follows: larger entry titles ("Acme Corp" + dates) are not sections.
    const datedSoon = lines.slice(i, i + 3).some((l) => l.tags.includes("DATE"));
    const isHeading =
      line.tags.includes("H") &&
      !line.tags.includes("BULLET") &&
      (kind !== null || (line.text.split(/\s+/).length <= 4 && !datedSoon));
    if (isHeading) {
      sections.push({
        kind: kind === null ? "other" : kind,
        heading_line: line.n,
        start_line: line.n,
        end_line: line.n,
        entries: [],
      });
      return;
    }
    if (sections.length === 0) {
      sections.push({ kind: "contact", heading_line: null, start_line: line.n, end_line: line.n, entries: [] });
    }
    sections[sections.length - 1].end_line = line.n;
  });
  for (const section of sections) {
    if (!ENTRY_KINDS.has(section.kind)) continue;
    const content = lines.filter(
      (l) => l.n >= section.start_line && l.n <= section.end_line && l.n !== section.heading_line,
    );
    section.entries = heuristicEntries(content);
  }
  return { sections };
}

// ---------------------------------------------------------------------------
// Validation and normalization
// ---------------------------------------------------------------------------

/** Structural problems that make a segmentation unusable. */
export function segmentationProblems(seg: Segmentation, lineCount: number): string[] {
  const problems: string[] = [];
  if (seg.sections.length === 0) return [`No sections returned; list the sections covering L1-L${lineCount}.`];
  const inRange = (n: number) => n >= 1 && n <= lineCount;
  let prevEnd = 0;
  seg.sections.forEach((s, i) => {
    const label = `sections[${i}] (${s.kind})`;
    if (!inRange(s.start_line) || !inRange(s.end_line)) {
      problems.push(`${label}: line numbers must be between 1 and ${lineCount}.`);
      return;
    }
    if (s.start_line > s.end_line) problems.push(`${label}: start_line is after end_line.`);
    if (s.start_line <= prevEnd) problems.push(`${label}: overlaps the previous section or is out of order.`);
    if (s.heading_line !== null && (s.heading_line < s.start_line || s.heading_line > s.end_line)) {
      problems.push(`${label}: heading_line must be inside the section.`);
    }
    prevEnd = Math.max(prevEnd, s.end_line);

    if (!ENTRY_KINDS.has(s.kind)) return;
    const contentStart = s.heading_line === s.start_line ? s.start_line + 1 : s.start_line;
    if (s.entries.length === 0 && contentStart <= s.end_line) {
      problems.push(`${label}: split its lines L${contentStart}-L${s.end_line} into entries (one per ${s.kind === "experience" ? "job" : s.kind === "education" ? "degree" : "project"}).`);
    }
    let prevEntryEnd = s.start_line - 1;
    s.entries.forEach((e, j) => {
      const eLabel = `${label}.entries[${j}]`;
      if (e.start_line < s.start_line || e.end_line > s.end_line || e.start_line > e.end_line) {
        problems.push(`${eLabel}: must be inside the section (L${s.start_line}-L${s.end_line}) with start_line ≤ end_line.`);
      } else if (e.start_line <= prevEntryEnd) {
        problems.push(`${eLabel}: overlaps the previous entry or is out of order.`);
      } else if (s.heading_line !== null && e.start_line <= s.heading_line && e.end_line >= s.heading_line) {
        problems.push(`${eLabel}: must not include the section heading line L${s.heading_line}.`);
      }
      prevEntryEnd = Math.max(prevEntryEnd, e.end_line);
    });
  });
  return problems;
}

/** Non-bullet lines carrying a date: the header lines of jobs / degrees. */
function datedHeaderLines(lines: ParseLine[], start: number, end: number): ParseLine[] {
  return lines.filter((l) => l.n >= start && l.n <= end && l.tags.includes("DATE") && !isBody(l));
}

/**
 * Advisory checks: an experience entry with several dated header lines usually merges
 * two jobs. Used to ask the model to double-check; never makes a result unusable.
 */
export function segmentationWarnings(seg: Segmentation, lines: ParseLine[]): string[] {
  const warnings: string[] = [];
  const covered = new Set<number>();
  for (const s of seg.sections) for (let n = s.start_line; n <= s.end_line; n++) covered.add(n);
  const uncovered = lines.filter((l) => !covered.has(l.n)).map((l) => l.n);
  if (uncovered.length > 0) {
    warnings.push(`Lines ${uncovered.map((n) => `L${n}`).join(", ")} are not in any section; every line belongs to exactly one section.`);
  }
  for (const s of seg.sections) {
    if (s.kind !== "experience") continue;
    for (const e of s.entries) {
      const dated = datedHeaderLines(lines, e.start_line, e.end_line);
      if (dated.length > 1) {
        warnings.push(
          `Entry L${e.start_line}-L${e.end_line} contains several date lines (${dated.map((l) => `L${l.n}`).join(", ")}); each job with its own dates is a separate entry.`,
        );
      }
    }
  }
  return warnings;
}

/**
 * Splits model entries that swallowed another job. A boundary the layout heuristic
 * found is applied when both sides have their own dated header line: two dated
 * headers in one entry are two jobs, whatever a small model answered.
 */
export function splitMergedEntries(seg: Segmentation, lines: ParseLine[]): Segmentation {
  return {
    sections: seg.sections.map((s) => {
      if (!ENTRY_KINDS.has(s.kind) || s.entries.length === 0) return s;
      const content = lines.filter(
        (l) => l.n >= s.start_line && l.n <= s.end_line && l.n !== s.heading_line,
      );
      const hinted = heuristicEntries(content);
      const strongStarts = hinted
        .filter((h) => datedHeaderLines(lines, h.start_line, Math.min(h.end_line, h.start_line + 2)).length > 0)
        .map((h) => h.start_line);
      const entries = s.entries.flatMap((e) => {
        const cuts = strongStarts.filter(
          (n) => n > e.start_line && n <= e.end_line && datedHeaderLines(lines, e.start_line, n - 1).length > 0,
        );
        if (cuts.length === 0) return [e];
        const bounds = [e.start_line, ...cuts];
        return bounds.map((start, i) => ({ start_line: start, end_line: i + 1 < bounds.length ? bounds[i + 1] - 1 : e.end_line }));
      });
      return { ...s, entries };
    }),
  };
}

/**
 * Starts a section at every unambiguous heading ("Experience", "Idiomas"…) the model
 * ran past. Small models often let the last section swallow the rest of the CV.
 */
export function enforceKnownHeadings(seg: Segmentation, lines: ParseLine[]): Segmentation {
  const headingStarts = new Map<number, SectionKind>();
  for (const line of lines) {
    if (!line.tags.includes("H") || line.tags.includes("BULLET")) continue;
    const kind = canonicalSectionType(line.text);
    if (kind) headingStarts.set(line.n, kind);
  }
  const sections: Section[] = [];
  for (const section of seg.sections) {
    const cuts = [...headingStarts.keys()]
      .filter((n) => n > section.start_line && n <= section.end_line && n !== section.heading_line)
      .sort((a, b) => a - b);
    if (cuts.length === 0) {
      sections.push(section);
      continue;
    }
    const bounds = [section.start_line, ...cuts];
    bounds.forEach((start, i) => {
      const end = i + 1 < bounds.length ? bounds[i + 1] - 1 : section.end_line;
      const first = i === 0;
      const kind = first ? section.kind : headingStarts.get(start)!;
      const heading = first ? section.heading_line : start;
      let entries = section.entries
        .filter((e) => e.start_line <= end && e.end_line >= start)
        .map((e) => ({ start_line: Math.max(e.start_line, heading === start ? start + 1 : start), end_line: Math.min(e.end_line, end) }))
        .filter((e) => e.start_line <= e.end_line);
      if (ENTRY_KINDS.has(kind) && (!first || entries.length === 0)) {
        const content = lines.filter((l) => l.n >= start && l.n <= end && l.n !== heading);
        entries = heuristicEntries(content);
      }
      sections.push({ kind, heading_line: heading, start_line: start, end_line: end, entries: ENTRY_KINDS.has(kind) ? entries : [] });
    });
  }
  return { sections };
}

/**
 * Sorts, clamps and closes gaps so every line belongs to exactly one section and
 * every content line of an entry section belongs to one entry.
 */
export function normalizeSegmentation(seg: Segmentation, lines: ParseLine[]): Segmentation {
  const last = lines[lines.length - 1]?.n ?? 0;
  const clamp = (n: number) => Math.min(Math.max(n, 1), last);
  const sections = seg.sections
    .map((s) => {
      const entries = s.entries
        .map((e) => ({ start_line: clamp(e.start_line), end_line: clamp(e.end_line) }))
        .filter((e) => e.start_line <= e.end_line)
        .sort((a, b) => a.start_line - b.start_line);
      // A section that ends before its own entries do is extended to cover them.
      const end = Math.max(clamp(s.end_line), ...entries.map((e) => e.end_line));
      return { ...s, start_line: clamp(s.start_line), end_line: end, entries };
    })
    .filter((s) => s.start_line <= s.end_line)
    .sort((a, b) => a.start_line - b.start_line)
    // Drop sections fully inside an earlier one (duplicates, bad ranges).
    .filter((s, i, all) => i === 0 || s.start_line > all[i - 1].start_line);
  if (sections.length === 0) return { sections: [] };
  if (sections[0].start_line > 1) {
    sections.unshift({ kind: "contact", heading_line: null, start_line: 1, end_line: sections[0].start_line - 1, entries: [] });
  }
  sections.forEach((s, i) => {
    const next = sections[i + 1];
    s.end_line = next ? next.start_line - 1 : last;
    if (!ENTRY_KINDS.has(s.kind)) {
      s.entries = [];
      return;
    }
    const contentStart = s.heading_line === s.start_line ? s.start_line + 1 : s.start_line;
    const entries = s.entries.filter((e) => e.end_line >= contentStart && e.start_line <= s.end_line);
    if (entries.length === 0) {
      s.entries = contentStart <= s.end_line ? [{ start_line: contentStart, end_line: s.end_line }] : [];
      return;
    }
    entries[0].start_line = contentStart;
    entries.forEach((e, j) => {
      const nextEntry = entries[j + 1];
      e.end_line = nextEntry ? nextEntry.start_line - 1 : s.end_line;
    });
    s.entries = entries.filter((e) => e.start_line <= e.end_line);
  });
  return { sections };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const LINE_FORMAT_NOTE = `The CV is given as numbered lines: "L07 [TAGS] text". Tags describe the layout of the original document:
BIG = large font (usually the candidate's name) · H = looks like a section heading · BULLET = bullet point · INDENT = indented · DATE = contains a date · GAP = extra space before the line (often a new entry).`;

const SEGMENT_EXAMPLE_LINES: ParseLine[] = [
  { n: 1, text: "Ana López", tags: ["BIG"] },
  { n: 2, text: "ana@mail.com | Madrid, Spain", tags: [] },
  { n: 3, text: "Experience", tags: ["H"] },
  { n: 4, text: "Acme Corp | Remote", tags: ["GAP"] },
  { n: 5, text: "Backend Developer | 03/2021 - Present", tags: ["DATE"] },
  { n: 6, text: "Built payment APIs in Go.", tags: ["BULLET"] },
  { n: 7, text: "Junior Developer at Beta SL", tags: ["GAP"] },
  { n: 8, text: "2019 - 2021", tags: ["DATE"] },
  { n: 9, text: "Maintained PHP applications.", tags: ["BULLET"] },
  { n: 10, text: "Education", tags: ["H"] },
  { n: 11, text: "BSc Computer Science, Universidad de Sevilla, 2019", tags: ["DATE"] },
];

const SEGMENT_EXAMPLE_ANSWER: Segmentation = {
  sections: [
    { kind: "contact", heading_line: null, start_line: 1, end_line: 2, entries: [] },
    {
      kind: "experience",
      heading_line: 3,
      start_line: 3,
      end_line: 9,
      entries: [
        { start_line: 4, end_line: 6 },
        { start_line: 7, end_line: 9 },
      ],
    },
    { kind: "education", heading_line: 10, start_line: 10, end_line: 11, entries: [{ start_line: 11, end_line: 11 }] },
  ],
};

export const SEGMENT_SYSTEM = `You find the structure of a CV (resume). You never rewrite its text: you answer only with section kinds and line numbers.

${LINE_FORMAT_NOTE}

Rules:
1. List the sections in document order. Together they cover every line exactly once, without overlaps.
2. A section starts at its heading line and ends on the line before the next section's heading. The lines before the first heading (name, contact details) form a "contact" section with heading_line null.
3. kind is one of: contact, summary (profile / objective), experience (jobs), education, skills, projects, certifications, languages, other (awards, volunteering, publications, references, interests…). Headings may be in any language ("Experiencia" = experience, "Formación" = education, "Idiomas" = languages).
4. For experience, education and projects, split the section into entries: one per job, degree or project. An entry starts at its first header line (company, title or dates) and includes all its bullet lines. Two roles at the same company with different titles or dates are two entries.
5. Entries never include the section heading line. Other kinds have "entries": [].

Example:
${renderLines(SEGMENT_EXAMPLE_LINES)}

Answer:
${JSON.stringify(SEGMENT_EXAMPLE_ANSWER)}`;

function describeGuess(seg: Segmentation): string {
  return seg.sections
    .map((s) => {
      const range = `L${s.start_line}-L${s.end_line}`;
      const entries = s.entries.length
        ? `; entries: ${s.entries.map((e) => `L${e.start_line}-L${e.end_line}`).join(", ")}`
        : "";
      return `- ${s.kind} ${range}${entries}`;
    })
    .join("\n");
}

export function buildSegmentPrompt(lines: ParseLine[], guess: Segmentation): string {
  return `<cv_lines>
${renderLines(lines)}
</cv_lines>

<parser_guess>
A rule-based parser proposed this structure. It is often right but can merge or split entries wrongly; check it against the lines.
${describeGuess(guess)}
</parser_guess>

Split the CV in <cv_lines> into sections and entries. Answer with the JSON object only.`;
}
