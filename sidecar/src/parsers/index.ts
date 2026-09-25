/**
 * Unified CV parsing entry point.
 * Handles PDF and DOCX files, extracting both raw text and structured CV data.
 */

import type { ParsedCvResult } from "../types.js";
import { parsePdf } from "./pdf.js";
import { parseDocx } from "./docx.js";
import { extractStructuredCv } from "./cv-extractor.js";

export interface CvParseResult {
  rawText: string;
  parsed: ParsedCvResult;
  pageCount?: number;
  metadata: Record<string, string>;
}

/**
 * Parse a CV file (PDF or DOCX) and extract structured data.
 *
 * @param filePath - Absolute path to the CV file
 * @param fileType - File format: "pdf" or "docx"
 * @returns Raw text, structured CV data, page count (if PDF), and file metadata
 */
export async function parseCvFile(
  filePath: string,
  fileType: "pdf" | "docx"
): Promise<CvParseResult> {
  let rawText: string;
  let pageCount: number | undefined;
  let metadata: Record<string, string>;

  process.stderr.write(`[parser] Parsing ${fileType} file: ${filePath}\n`);

  switch (fileType) {
    case "pdf": {
      const pdfResult = await parsePdf(filePath);
      rawText = pdfResult.rawText;
      pageCount = pdfResult.pageCount;
      metadata = pdfResult.metadata;
      break;
    }
    case "docx": {
      const docxResult = await parseDocx(filePath);
      rawText = docxResult.rawText;
      metadata = docxResult.metadata;
      break;
    }
    default: {
      // This should never happen due to TypeScript's exhaustive checking,
      // but provides a safety net.
      const exhaustive: never = fileType;
      throw new Error(`Unsupported file type: ${String(exhaustive)}`);
    }
  }

  // Run the structured CV extraction on the raw text
  const parsed = extractStructuredCv(rawText);

  process.stderr.write(
    `[parser] Extraction complete. Name: "${parsed.full_name}", ` +
    `Skills: ${parsed.skills.technical.length} technical / ${parsed.skills.soft.length} soft, ` +
    `Experience: ${parsed.experience.length} entries, ` +
    `Education: ${parsed.education.length} entries\n`
  );

  return {
    rawText,
    parsed,
    pageCount,
    metadata,
  };
}

// Re-export the CV extractor for direct use
export { extractStructuredCv } from "./cv-extractor.js";
