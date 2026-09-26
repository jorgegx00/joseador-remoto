/**
 * Numbered, tagged CV lines: the shared input of every LLM parsing call.
 *
 * The model never rewrites CV text. It answers with line numbers and short verbatim
 * fields; code rebuilds the content from the lines. Tags carry the layout signals
 * (font size, indentation, bullets, detected dates) that plain text loses, so a small
 * model can see structure instead of guessing it from wording.
 */

import type { CvLayoutLine } from "@/types/cv";
import { findDateRange } from "@/lib/cv/cv-claims";
import { canonicalSectionType } from "@/lib/cv/section-aliases";

export type LineTag =
  /** Much larger than body text: usually the candidate's name. */
  | "BIG"
  /** Looks like a section heading (larger/bold/all-caps short line or a known heading). */
  | "H"
  /** Bullet point or list item. */
  | "BULLET"
  /** Indented under the line above. */
  | "INDENT"
  /** Contains a date or date range. */
  | "DATE"
  /** Preceded by extra vertical space (often a new entry). */
  | "GAP";

export interface ParseLine {
  /** 1-based line number shown to the model. */
  n: number;
  text: string;
  tags: LineTag[];
}

const BULLET_RE = /^\s*[•●○◦▪▫■□▸►‣⁃∙·*\-–]\s+/;
const MD_HEADING_RE = /^(#{1,6})\s+(.*)$/;

function isAllCapsHeading(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 4 && text.length <= 40 && letters === letters.toUpperCase();
}

function isKnownHeading(text: string): boolean {
  return text.length <= 50 && canonicalSectionType(text.replace(/[:：]\s*$/, "")) !== null;
}

function fromLayout(layout: CvLayoutLine[]): ParseLine[] {
  return layout.map((line, i) => {
    const text = line.text.trim();
    const tags: LineTag[] = [];
    if (line.size >= 1.3) tags.push("BIG");
    const short = text.length <= 50 && !/[.!?]$/.test(text);
    if (
      !line.bullet &&
      short &&
      (isKnownHeading(text) || (line.size >= 1.08 && line.size < 1.3) || (line.bold && isAllCapsHeading(text)))
    ) {
      tags.push("H");
    }
    if (line.bullet) tags.push("BULLET");
    if (line.indent > 0 && !line.bullet) tags.push("INDENT");
    if (findDateRange(text)) tags.push("DATE");
    if (line.gap >= 1.4 && i > 0) tags.push("GAP");
    return { n: i + 1, text, tags };
  });
}

/**
 * Fallback for CVs without layout (older uploads, tailored markdown): tags come from
 * markdown syntax, bullet glyphs and heading words, and hard-wrapped lines are joined.
 */
function fromText(rawText: string): ParseLine[] {
  const merged: Array<{ text: string; tags: LineTag[] }> = [];
  let blankBefore = false;
  for (const rawLine of rawText.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^-{2,}\s*\d+\s*(?:of|de)\s*\d+\s*-{2,}$/i.test(trimmed)) {
      blankBefore = merged.length > 0;
      continue;
    }
    const tags: LineTag[] = [];
    let text = trimmed;
    const heading = MD_HEADING_RE.exec(trimmed);
    if (heading) {
      text = heading[2].replace(/\*\*/g, "").trim();
      if (heading[1].length === 1) tags.push("BIG");
      else if (heading[1].length === 2) tags.push("H");
      // "### Title at Company" starts an entry.
      else tags.push("GAP");
    } else if (BULLET_RE.test(trimmed)) {
      text = trimmed.replace(BULLET_RE, "");
      tags.push("BULLET");
    } else if (isKnownHeading(trimmed) || isAllCapsHeading(trimmed)) {
      tags.push("H");
    }
    text = text.replace(/^\*(.+)\*$/, "$1").replace(/^\*\*(.+)\*\*$/, "$1");

    // Join a hard-wrapped line onto the previous one: previous is long, doesn't end a
    // sentence, and this line starts in lowercase with no structure of its own.
    const prev = merged[merged.length - 1];
    const continues =
      prev &&
      !blankBefore &&
      tags.length === 0 &&
      !prev.tags.includes("H") &&
      !prev.tags.includes("BIG") &&
      prev.text.length >= 40 &&
      !/[.!?:;]$/.test(prev.text) &&
      /^[\p{Ll}(]/u.test(text);
    if (continues) {
      prev.text = `${prev.text} ${text}`;
      continue;
    }
    if (blankBefore && merged.length > 0) tags.push("GAP");
    merged.push({ text, tags });
    blankBefore = false;
  }
  return merged.map((line, i) => {
    const tags = [...line.tags];
    if (findDateRange(line.text)) tags.push("DATE");
    return { n: i + 1, text: line.text, tags };
  });
}

export function buildParseLines(rawText: string, layout: CvLayoutLine[] | null | undefined): ParseLine[] {
  return layout && layout.length > 0 ? fromLayout(layout) : fromText(rawText);
}

/** "L07 [H] Experience" — zero-padded so numbers align and are easy to copy. */
export function renderLines(lines: ParseLine[]): string {
  const width = String(lines[lines.length - 1]?.n ?? 0).length;
  return lines
    .map((line) => {
      const tags = line.tags.length ? ` [${line.tags.join(",")}]` : "";
      return `L${String(line.n).padStart(width, "0")}${tags} ${line.text}`;
    })
    .join("\n");
}

/** Lines start..end (inclusive, 1-based). */
export function sliceLines(lines: ParseLine[], start: number, end: number): ParseLine[] {
  return lines.filter((l) => l.n >= start && l.n <= end);
}

/** Case/accent/whitespace-insensitive form for verbatim checks. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `value` appears in `source` (ignoring case, accents and spacing). */
export function appearsIn(value: string, source: string): boolean {
  const v = normalizeForMatch(value);
  return v.length === 0 || normalizeForMatch(source).includes(v);
}
