/**
 * Layout reconstruction for CV documents.
 *
 * Plain text extraction loses exactly the signals that tell a CV's structure apart:
 * reading order (headers drawn last end up at the bottom), font size (section
 * headings), indentation (bullets vs entry headers) and line wrapping (one bullet
 * split over two lines). This module rebuilds ordered, merged lines from positioned
 * text items, and is pure so it can be tested without a PDF.
 */

import type { CvLine } from "../types.js";

export interface TextItem {
  str: string;
  /** Left edge, in points from the page's left. */
  x: number;
  /** Baseline, in points from the page's bottom (PDF space). */
  y: number;
  width: number;
  /** Font size in points. */
  fontSize: number;
  bold: boolean;
}

export interface PageItems {
  width: number;
  height: number;
  items: TextItem[];
}

interface RawLine {
  items: TextItem[];
  text: string;
  x: number;
  right: number;
  y: number;
  fontSize: number;
  bold: boolean;
}

const BULLET_RE = /^\s*([•●○◦▪▫■□▸►‣⁃∙·*\-–‣⁃])\s+/;
const PAGE_MARKER_RE = /^(?:-+\s*)?(?:page\s*)?\d+\s*(?:(?:of|de|\/)\s*\d+)?(?:\s*-+)?$/i;
const SENTENCE_END_RE = /[.!?:;)]$/;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Joins the items of one visual line, inserting spaces where the gap between items shows one. */
function joinItems(items: TextItem[]): string {
  let text = "";
  let prevRight: number | null = null;
  for (const item of items) {
    if (prevRight !== null) {
      const gap = item.x - prevRight;
      const needsSpace = gap > item.fontSize * 0.15 && !text.endsWith(" ") && !item.str.startsWith(" ");
      if (needsSpace) text += " ";
    }
    text += item.str;
    prevRight = item.x + item.width;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Groups items into visual lines (same baseline within tolerance), top to bottom. */
export function groupLines(items: TextItem[]): RawLine[] {
  const visible = items.filter((i) => i.str.trim().length > 0);
  visible.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of visible) {
    const current = lines[lines.length - 1];
    const tolerance = Math.max(2, item.fontSize * 0.3);
    if (current && Math.abs(current[0].y - item.y) <= tolerance) current.push(item);
    else lines.push([item]);
  }
  return lines.map((lineItems) => {
    lineItems.sort((a, b) => a.x - b.x);
    const chars = lineItems.reduce((n, i) => n + i.str.length, 0);
    const boldChars = lineItems.filter((i) => i.bold).reduce((n, i) => n + i.str.length, 0);
    return {
      items: lineItems,
      text: joinItems(lineItems),
      x: lineItems[0].x,
      right: Math.max(...lineItems.map((i) => i.x + i.width)),
      y: median(lineItems.map((i) => i.y)),
      fontSize: Math.max(...lineItems.map((i) => i.fontSize)),
      bold: chars > 0 && boldChars / chars > 0.8,
    };
  });
}

/**
 * Finds a vertical gutter splitting the page into two text columns (sidebar CVs).
 * A gutter is an x position that almost no item crosses, with a substantial share of
 * the text on each side. Right-aligned dates don't qualify: they are too little text.
 */
export function findGutter(items: TextItem[], pageWidth: number): number | null {
  const visible = items.filter((i) => i.str.trim().length > 0);
  const totalChars = visible.reduce((n, i) => n + i.str.length, 0);
  if (visible.length < 20 || totalChars === 0) return null;
  let best: { x: number; crossing: number } | null = null;
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.8; x += 2) {
    let crossing = 0;
    let leftChars = 0;
    for (const item of visible) {
      if (item.x < x && item.x + item.width > x) crossing++;
      else if (item.x + item.width <= x) leftChars += item.str.length;
    }
    const leftShare = leftChars / totalChars;
    if (leftShare < 0.08 || leftShare > 0.92) continue;
    if (crossing / visible.length > 0.01) continue;
    if (!best || crossing < best.crossing) best = { x, crossing };
  }
  return best ? best.x : null;
}

/** Lines that repeat on several pages at the top/bottom (running headers, footers, page numbers). */
function repeatedEdgeTexts(pages: RawLine[][]): Set<string> {
  const seen = new Map<string, number>();
  for (const lines of pages) {
    const edges = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const text of new Set(edges.map((l) => l.text.replace(/\d+/g, "#")))) {
      seen.set(text, (seen.get(text) ?? 0) + 1);
    }
  }
  return new Set([...seen].filter(([, n]) => n >= 2 && pages.length >= 2).map(([t]) => t));
}

function endsSentence(text: string): boolean {
  return SENTENCE_END_RE.test(text.trim());
}

/**
 * Builds the document's logical lines: column-aware reading order, running
 * headers/footers dropped, layout features computed, wrapped lines merged.
 */
export function buildCvLines(pages: PageItems[]): CvLine[] {
  const allItems = pages.flatMap((p) => p.items).filter((i) => i.str.trim());
  // Body size = the font size most characters are set in.
  const bodySize = median(allItems.flatMap((i) => Array(Math.min(i.str.length, 50)).fill(i.fontSize))) || 10;

  // Per page: split into columns, group into lines.
  const pageColumns: RawLine[][][] = pages.map((page) => {
    const gutter = findGutter(page.items, page.width);
    if (gutter === null) return [groupLines(page.items)];
    const left = page.items.filter((i) => i.x + i.width / 2 < gutter);
    const right = page.items.filter((i) => i.x + i.width / 2 >= gutter);
    return [groupLines(left), groupLines(right)];
  });

  const repeated = repeatedEdgeTexts(pageColumns.map((cols) => cols.flat().sort((a, b) => b.y - a.y)));
  const out: CvLine[] = [];

  pageColumns.forEach((columns, pageIndex) => {
    for (const column of columns) {
      const lines = column.filter(
        (l) => !PAGE_MARKER_RE.test(l.text) && !repeated.has(l.text.replace(/\d+/g, "#")),
      );
      if (lines.length === 0) continue;
      const leftEdge = percentile(lines.map((l) => l.x), 0.05);
      const rightEdge = percentile(lines.map((l) => l.right), 0.95);
      const columnWidth = Math.max(rightEdge - leftEdge, 1);
      const spacings = lines
        .slice(1)
        .map((l, i) => lines[i].y - l.y)
        .filter((d) => d > 0);
      const lineSpacing = median(spacings) || bodySize * 1.2;

      let prev: { raw: RawLine; line: CvLine } | null = null;
      for (const raw of lines) {
        const gap = prev ? (prev.raw.y - raw.y) / lineSpacing : 0;
        const size = Math.round((raw.fontSize / bodySize) * 20) / 20;
        const bulletMatch = BULLET_RE.exec(raw.text);
        const text = bulletMatch ? raw.text.slice(bulletMatch[0].length) : raw.text;
        const indentPts = raw.x - leftEdge;
        const center = (raw.x + raw.right) / 2;
        const centered = indentPts > columnWidth * 0.1 && Math.abs(center - (leftEdge + rightEdge) / 2) < columnWidth * 0.05;
        const line: CvLine = {
          text,
          page: pageIndex + 1,
          size,
          indent: indentPts > 4 && !centered ? 1 : 0,
          centered,
          gap: Math.round(gap * 10) / 10,
          bold: raw.bold,
          bullet: bulletMatch !== null,
        };

        // A line continues the previous one when the previous one ran to the right
        // margin without ending a sentence, in the same style and indentation.
        // Short lines (sidebar skills, "Remote") fill a narrow column without wrapping.
        const prevFull = prev
          ? prev.raw.right >= rightEdge - columnWidth * 0.08 && prev.raw.text.length >= 35
          : false;
        const continues =
          prev !== null &&
          prevFull &&
          !line.bullet &&
          gap > 0 &&
          gap <= 1.35 &&
          Math.abs(prev.line.size - line.size) < 0.05 &&
          prev.line.bold === line.bold &&
          (prev.line.indent === line.indent || (prev.line.bullet && line.indent >= prev.line.indent)) &&
          !endsSentence(prev.line.text);
        if (continues && prev) {
          prev.line.text = `${prev.line.text} ${text}`;
          prev.raw = { ...raw, x: prev.raw.x, right: raw.right };
          continue;
        }
        out.push(line);
        prev = { raw, line };
      }
    }
  });
  return out;
}

/** Plain text for the heuristic parser and storage: one line per logical line, bullets marked. */
export function renderCvLines(lines: CvLine[]): string {
  return lines.map((l) => (l.bullet ? `• ${l.text}` : l.text)).join("\n");
}
