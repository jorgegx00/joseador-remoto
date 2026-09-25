/**
 * PDF file parser using pdf-parse v2.
 * Extracts raw text, page count, and metadata from PDF files.
 */

import { PDFParse } from "pdf-parse";
import fs from "fs/promises";

export interface PdfParseResult {
  rawText: string;
  pageCount: number;
  metadata: Record<string, string>;
}

export async function parsePdf(filePath: string): Promise<PdfParseResult> {
  // Verify file exists
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("no such file")) {
      throw new Error(`PDF file not found: ${filePath}`);
    }
    throw new Error(`Failed to read PDF file: ${msg}`);
  }

  // Verify file is not empty
  if (fileBuffer.length === 0) {
    throw new Error(`PDF file is empty: ${filePath}`);
  }

  // Check for PDF magic bytes
  const header = fileBuffer.subarray(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    throw new Error(`File does not appear to be a valid PDF: ${filePath}`);
  }

  // Convert Buffer to Uint8Array for pdf-parse v2
  const data = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);

  // Parse the PDF using pdf-parse v2 API
  const parser = new PDFParse({ data });

  let textResult: Awaited<ReturnType<PDFParse["getText"]>>;
  try {
    textResult = await parser.getText();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("encrypt") || msg.includes("password")) {
      throw new Error(`PDF file is encrypted or password-protected: ${filePath}`);
    }
    throw new Error(`Failed to parse PDF: ${msg}`);
  }

  // Extract metadata
  const metadata: Record<string, string> = {};
  try {
    const infoResult = await parser.getInfo();
    if (infoResult.info) {
      const info = infoResult.info as Record<string, unknown>;
      for (const [key, value] of Object.entries(info)) {
        if (typeof value === "string" && value.trim().length > 0) {
          metadata[key] = value.trim();
        } else if (typeof value === "number") {
          metadata[key] = String(value);
        }
      }
    }
  } catch {
    // Metadata extraction is best-effort
    process.stderr.write(`[pdf-parser] Warning: Could not extract metadata from: ${filePath}\n`);
  }

  const rawText = textResult.text ?? "";
  const pageCount = textResult.total ?? 0;

  if (rawText.trim().length === 0) {
    process.stderr.write(
      `[pdf-parser] Warning: PDF has no extractable text (may be image-based): ${filePath}\n`
    );
  }

  // Clean up the parser
  try {
    await parser.destroy();
  } catch {
    // Ignore cleanup errors
  }

  return {
    rawText,
    pageCount,
    metadata,
  };
}
