/**
 * MdBlock[] -> pdfmake document definition for an ATS-friendly CV: single column, real
 * (selectable) text in reading order, no tables/columns/images, standard section headings.
 * Imports only pdfmake TYPES; the runtime is loaded lazily by src/services/cv-export.ts.
 */

import type {
  Content,
  ContentText,
  Node as PdfNode,
  StyleDictionary,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { InlineRun, MdBlock } from "@/lib/cv/markdown-blocks";
import type { CvExportMeta } from "./types";

export type CvPdfPageSize = "LETTER" | "A4";

/** [left, top, right, bottom] in points. */
export const CV_PDF_MARGINS: [number, number, number, number] = [48, 44, 48, 44];

const PAGE_WIDTH_PT: Record<CvPdfPageSize, number> = { LETTER: 612, A4: 595.28 };

const TEXT_COLOR = "#1a1a1a";
const RULE_COLOR = "#8a8f98";
const LINK_COLOR = "#1a4d8f";

/** Style names used by headings (never counted as "content following a heading"). */
const HEADING_STYLES = new Set(["name", "section", "subheading"]);

export const CV_PDF_STYLES: StyleDictionary = {
  name: { fontSize: 18, bold: true, margin: [0, 0, 0, 4], lineHeight: 1.1 },
  section: { fontSize: 11.5, bold: true, characterSpacing: 0.4, margin: [0, 10, 0, 0] },
  subheading: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 1] },
  paragraph: { margin: [0, 0, 0, 5] },
  list: { margin: [0, 0, 0, 5] },
  link: { color: LINK_COLOR },
};

function runToPdf(run: InlineRun, upper: boolean): ContentText {
  const out: ContentText = { text: upper ? run.text.toUpperCase() : run.text };
  if (run.bold) out.bold = true;
  if (run.italic) out.italics = true;
  if (run.href) {
    out.link = run.href;
    out.style = "link";
  }
  return out;
}

function runsToPdf(runs: InlineRun[], upper = false): ContentText[] {
  return runs.filter((r) => r.text.length > 0).map((r) => runToPdf(r, upper));
}

function hasText(runs: InlineRun[]): boolean {
  return runs.some((r) => r.text.trim().length > 0);
}

function ruleLine(width: number, margin: [number, number, number, number]): Content {
  return {
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.6, lineColor: RULE_COLOR },
    ],
    margin,
  };
}

function paragraphToPdf(lines: InlineRun[][]): Content | null {
  const inline: Array<ContentText | string> = [];
  lines.forEach((line, i) => {
    if (i > 0) inline.push("\n");
    inline.push(...runsToPdf(line));
  });
  if (!lines.some(hasText)) return null;
  return { text: inline, style: "paragraph" };
}

function listToPdf(block: Extract<MdBlock, { type: "list" }>): Content | null {
  const top: Content[] = [];
  let nested: Content[] | null = null;
  for (const item of block.items) {
    if (!hasText(item.runs)) continue;
    const text: ContentText = { text: runsToPdf(item.runs) };
    if (item.level === 1 && top.length > 0) {
      if (!nested) {
        nested = [];
        top.push(
          block.ordered
            ? { ol: nested, type: "lower-alpha", margin: [0, 1, 0, 1] }
            : { ul: nested, type: "circle", margin: [0, 1, 0, 1] },
        );
      }
      nested.push(text);
    } else {
      nested = null;
      top.push(text);
    }
  }
  if (top.length === 0) return null;
  return block.ordered ? { ol: top, style: "list" } : { ul: top, style: "list" };
}

function styleNames(node: PdfNode): string[] {
  const style = node.style as unknown;
  if (typeof style === "string") return [style];
  if (Array.isArray(style)) return style.filter((s): s is string => typeof s === "string");
  return [];
}

/**
 * Keeps headings with their content: when nothing but other headings/rules follows a
 * heading on its page (and content exists later), the heading moves to the next page.
 */
function keepHeadingsWithNext(
  node: PdfNode,
  queries: {
    getFollowingNodesOnPage: () => PdfNode[];
    getNodesOnNextPage: () => PdfNode[];
  },
): boolean {
  if (!node.headlineLevel) return false;
  const isContent = (n: PdfNode) =>
    !n.headlineLevel && !n.canvas && !styleNames(n).some((s) => HEADING_STYLES.has(s));
  const followingContent = queries.getFollowingNodesOnPage().filter(isContent);
  if (followingContent.length > 0) return false;
  return queries.getNodesOnNextPage().some(isContent);
}

export function buildPdfDocDefinition(
  blocks: MdBlock[],
  meta: CvExportMeta,
  opts?: { pageSize?: CvPdfPageSize },
): TDocumentDefinitions {
  const pageSize = opts?.pageSize ?? meta.pageSize ?? "LETTER";
  const contentWidth = PAGE_WIDTH_PT[pageSize] - CV_PDF_MARGINS[0] - CV_PDF_MARGINS[2];
  const content: Content[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        if (!hasText(block.runs)) break;
        if (block.level === 1) {
          content.push({ text: runsToPdf(block.runs), style: "name", headlineLevel: 1 });
        } else if (block.level === 2) {
          // Heading + its rule never split across pages.
          content.push({
            stack: [
              { text: runsToPdf(block.runs, true), style: "section" },
              ruleLine(contentWidth, [0, 2, 0, 5]),
            ],
            unbreakable: true,
            headlineLevel: 2,
          });
        } else {
          content.push({ text: runsToPdf(block.runs), style: "subheading", headlineLevel: 3 });
        }
        break;
      }
      case "paragraph": {
        const p = paragraphToPdf(block.lines);
        if (p) content.push(p);
        break;
      }
      case "list": {
        const l = listToPdf(block);
        if (l) content.push(l);
        break;
      }
      case "rule":
        content.push(ruleLine(contentWidth, [0, 4, 0, 8]));
        break;
    }
  }

  const keywords = (meta.keywords ?? []).map((k) => k.trim()).filter(Boolean);

  return {
    pageSize,
    pageMargins: CV_PDF_MARGINS,
    info: {
      title: meta.title,
      author: meta.author,
      ...(meta.subject ? { subject: meta.subject } : {}),
      ...(keywords.length > 0 ? { keywords: keywords.join(", ") } : {}),
    },
    content,
    styles: CV_PDF_STYLES,
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2, color: TEXT_COLOR },
    pageBreakBefore: keepHeadingsWithNext,
  };
}
