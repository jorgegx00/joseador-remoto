/**
 * Positioned text extraction for PDFs via pdfjs-dist, feeding layout.ts.
 */

import type { CvLine } from "../types.js";
import { buildCvLines, type PageItems, type TextItem } from "./layout.js";

const BOLD_FONT_RE = /bold|black|heavy|semibold|demi/i;

interface PdfFontInfo {
  name?: string;
  bold?: boolean;
  black?: boolean;
}

export async function extractPdfLines(data: Uint8Array): Promise<CvLine[]> {
  // pdfjs-dist is ESM-only; the sidecar bundle is CJS, so load it dynamically.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    const pages: PageItems[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      // The operator list loads the fonts, which is where their real names (and so
      // boldness) live; text content alone only has internal font ids.
      await page.getOperatorList();
      const content = await page.getTextContent();
      const boldByFont = new Map<string, boolean>();
      const isBold = (fontName: string): boolean => {
        let bold = boldByFont.get(fontName);
        if (bold === undefined) {
          let font: PdfFontInfo | undefined;
          try {
            font = page.commonObjs.has(fontName) ? (page.commonObjs.get(fontName) as PdfFontInfo) : undefined;
          } catch {
            font = undefined;
          }
          bold = Boolean(font?.bold || font?.black || BOLD_FONT_RE.test(font?.name ?? ""));
          boldByFont.set(fontName, bold);
        }
        return bold;
      };

      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str) continue;
        const [a, b, , , e, f] = raw.transform as number[];
        items.push({
          str: raw.str,
          x: e,
          y: f,
          width: raw.width,
          fontSize: Math.hypot(a, b) || raw.height,
          bold: isBold(raw.fontName),
        });
      }
      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
    return buildCvLines(pages);
  } finally {
    await doc.destroy();
  }
}
