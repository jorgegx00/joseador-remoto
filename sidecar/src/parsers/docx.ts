/**
 * DOCX file parser using mammoth.
 * Extracts raw text and metadata from Word documents.
 */

import mammoth from "mammoth";
import fs from "fs/promises";

export interface DocxParseResult {
  rawText: string;
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

  const rawText = result.value ?? "";

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
    metadata,
  };
}
