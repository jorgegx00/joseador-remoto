/**
 * MdBlock[] -> docx Document for an ATS-friendly CV: single column, real Word heading
 * styles (Title / Heading 1 / Heading 2), native bullet lists, no tables or text boxes.
 * Loaded through a dynamic import (src/services/cv-export.ts) so `docx` stays out of the
 * main bundle.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from "docx";
import type { InlineRun, MdBlock } from "@/lib/cv/markdown-blocks";
import type { CvExportMeta } from "./types";

const FONT = "Calibri";
/** Sizes are half-points. */
const BODY_SIZE = 21; // 10.5pt
const NAME_SIZE = 36; // 18pt
const SECTION_SIZE = 23; // 11.5pt
const SUBHEADING_SIZE = 21; // 10.5pt
const TEXT_COLOR = "1A1A1A";
const RULE_COLOR = "8A8F98";

/** US Letter in twips (8.5in x 11in); margins match the PDF (48pt / 44pt). */
const LETTER_WIDTH = 12240;
const LETTER_HEIGHT = 15840;
const MARGIN_X = 960;
const MARGIN_Y = 880;

const ORDERED_REF = "cv-ordered";

function runsToChildren(runs: InlineRun[]): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    if (run.href) {
      children.push(
        new ExternalHyperlink({
          link: run.href,
          children: [
            new TextRun({
              text: run.text,
              bold: run.bold,
              italics: run.italic,
              style: "Hyperlink",
            }),
          ],
        }),
      );
    } else {
      children.push(new TextRun({ text: run.text, bold: run.bold, italics: run.italic }));
    }
  }
  return children;
}

function hasText(runs: InlineRun[]): boolean {
  return runs.some((r) => r.text.trim().length > 0);
}

function ruleParagraph(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
    spacing: { before: 60, after: 120 },
  });
}

function blocksToParagraphs(blocks: MdBlock[]): Paragraph[] {
  const out: Paragraph[] = [];
  let orderedInstance = 0;

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        if (!hasText(block.runs)) break;
        const children = runsToChildren(block.runs);
        if (block.level === 1) {
          out.push(new Paragraph({ heading: HeadingLevel.TITLE, children }));
        } else if (block.level === 2) {
          out.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children,
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 },
              },
            }),
          );
        } else {
          out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children }));
        }
        break;
      }
      case "paragraph": {
        if (!block.lines.some(hasText)) break;
        const children: ParagraphChild[] = [];
        block.lines.forEach((line, i) => {
          // Hard line breaks (contact lines) stay inside one paragraph.
          if (i > 0) children.push(new TextRun({ break: 1 }));
          children.push(...runsToChildren(line));
        });
        out.push(new Paragraph({ children }));
        break;
      }
      case "list": {
        orderedInstance += block.ordered ? 1 : 0;
        let hasParent = false;
        for (const item of block.items) {
          if (!hasText(item.runs)) continue;
          const level = item.level === 1 && hasParent ? 1 : 0;
          hasParent = true;
          out.push(
            new Paragraph({
              children: runsToChildren(item.runs),
              spacing: { after: 30 },
              ...(block.ordered
                ? { numbering: { reference: ORDERED_REF, level, instance: orderedInstance } }
                : { bullet: { level } }),
            }),
          );
        }
        break;
      }
      case "rule":
        out.push(ruleParagraph());
        break;
    }
  }

  if (out.length === 0) out.push(new Paragraph({ children: [] }));
  return out;
}

export function buildDocxDocument(blocks: MdBlock[], meta: CvExportMeta): Document {
  const keywords = (meta.keywords ?? []).map((k) => k.trim()).filter(Boolean);

  return new Document({
    creator: meta.author,
    lastModifiedBy: meta.author,
    title: meta.title,
    ...(meta.subject ? { subject: meta.subject, description: meta.subject } : {}),
    ...(keywords.length > 0 ? { keywords: keywords.join(", ") } : {}),
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE, color: TEXT_COLOR },
          paragraph: { spacing: { after: 80, line: 264 } },
        },
        title: {
          run: { font: FONT, size: NAME_SIZE, bold: true, color: "000000" },
          paragraph: { spacing: { after: 80 } },
        },
        heading1: {
          run: { font: FONT, size: SECTION_SIZE, bold: true, allCaps: true, color: "000000" },
          paragraph: { spacing: { before: 220, after: 100 }, keepNext: true, keepLines: true },
        },
        heading2: {
          run: { font: FONT, size: SUBHEADING_SIZE, bold: true, color: "000000" },
          paragraph: { spacing: { before: 140, after: 30 }, keepNext: true, keepLines: true },
        },
        listParagraph: {
          run: { font: FONT, size: BODY_SIZE },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: ORDERED_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: "%2.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: LETTER_WIDTH, height: LETTER_HEIGHT },
            margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_X, right: MARGIN_X },
          },
        },
        children: blocksToParagraphs(blocks),
      },
    ],
  });
}
