/**
 * DOCX file parser using mammoth.
 * Extracts raw text and metadata from Word documents.
 */

import mammoth from "mammoth";
import fs from "fs/promises";
import type { CvLine } from "../types.js";
import { renderCvLines } from "./layout.js";

export interface DocxParseResult {
  rawText: string;
  /** Lines with heading/bold/list signals from the document's HTML; empty on failure. */
  lines: CvLine[];
  metadata: Record<string, string>;
}

interface MammothMessage {
  type: string;
  message: string;
}

interface MammothExtractResult {
  value: string;
  messages: MammothMessage[];
}

export async function parseDocx(filePath: string): Promise<DocxParseResult> {
  // Verify file exists
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("no such file")) {
      throw new Error(`DOCX file not found: ${filePath}`);
    }
    throw new Error(`Failed to read DOCX file: ${msg}`);
  }

  // Verify file is not empty
  if (fileBuffer.length === 0) {
    throw new Error(`DOCX file is empty: ${filePath}`);
  }

  // Check for ZIP magic bytes (DOCX is a ZIP archive)
  const header = fileBuffer.subarray(0, 4);
  if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
    throw new Error(`File does not appear to be a valid DOCX: ${filePath}`);
  }

  // Parse the DOCX
  let result: MammothExtractResult;
  try {
    result = await mammoth.extractRawText({ buffer: fileBuffer }) as MammothExtractResult;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse DOCX: ${msg}`);
  }

  // The HTML conversion keeps headings, bold runs and list items, which plain text
  // loses; the raw text extraction stays as the fallback.
  let lines: CvLine[] = [];
  try {
    const html = await mammoth.convertToHtml({ buffer: fileBuffer });
    lines = htmlToCvLines(html.value ?? "");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[docx-parser] Warning: HTML conversion failed, using plain text: ${msg}\n`);
  }

  const rawText = lines.length > 0 ? renderCvLines(lines) : (result.value ?? "");

  // Log any mammoth warnings
  if (result.messages && result.messages.length > 0) {
    for (const msg of result.messages) {
      process.stderr.write(`[docx-parser] Warning: ${msg.message}\n`);
    }
  }

  if (rawText.trim().length === 0) {
    process.stderr.write(
      `[docx-parser] Warning: DOCX has no extractable text: ${filePath}\n`
    );
  }

  // DOCX metadata from mammoth is limited; provide what we can
  const metadata: Record<string, string> = {};
  metadata["format"] = "docx";
  metadata["textLength"] = String(rawText.length);

  return {
    rawText,
    lines,
    metadata,
  };
}

const HEADING_SIZE: Record<string, number> = { h1: 1.6, h2: 1.3, h3: 1.15, h4: 1.1, h5: 1.05, h6: 1.05 };

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/**
 * Maps mammoth's HTML to layout lines: headings get a larger size, paragraphs that
 * are entirely bold are bold, list items are indented bullets. Table cells in one
 * row are joined with " | " so "Company | Dates" rows stay on one line.
 */
export function htmlToCvLines(html: string): CvLine[] {
  const lines: CvLine[] = [];
  const withRows = html.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, row: string) => {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      m[1].replace(/<\/?p[^>]*>/g, " ").trim(),
    );
    return `<p>${cells.filter(Boolean).join(" | ")}</p>`;
  });
  const blockRe = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(withRows)) !== null) {
    const tag = match[1];
    const inner = match[2].replace(/<(ul|ol)[\s\S]*$/, "");
    const text = decodeEntities(inner.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const boldText = [...inner.matchAll(/<strong>([\s\S]*?)<\/strong>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    lines.push({
      text,
      page: 1,
      size: HEADING_SIZE[tag] ?? 1,
      indent: tag === "li" ? 1 : 0,
      centered: false,
      gap: 1,
      bold: tag.startsWith("h") || boldText.length >= text.length * 0.8,
      bullet: tag === "li",
    });
  }
  return lines;
}
