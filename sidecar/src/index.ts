/**
 * Sidecar entry point — CV parsing only.
 * Reads JSON commands from stdin, processes them, and writes JSON results to stdout.
 * Communication protocol: one JSON object per line (NDJSON).
 *
 * All debug/log output goes to stderr. Only JSON protocol messages go to stdout.
 *
 * The job scrapers that used to live here were removed: jobs are now ingested
 * in-app via paid APIs (see src/services/ingest/) straight into the local DB.
 */

import type { ScrapeCommand, ScrapeResult } from "./types.js";
import { parseCvFile } from "./parsers/index.js";

const VERSION = "0.2.0";

function sendResult(result: ScrapeResult): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

async function handleCommand(command: ScrapeCommand): Promise<void> {
  switch (command.action) {
    case "parse_cv": {
      const filePath = command.file_path;
      const fileType = command.file_type;
      const cvId = command.cv_id;

      if (!filePath) {
        sendResult({
          type: "error",
          data: { cv_id: cvId, message: "Missing file_path for parse_cv action" },
        });
        break;
      }

      if (!fileType || (fileType !== "pdf" && fileType !== "docx")) {
        sendResult({
          type: "error",
          data: { cv_id: cvId, message: `Invalid or missing file_type: ${String(fileType)}. Must be "pdf" or "docx"` },
        });
        break;
      }

      try {
        const result = await parseCvFile(filePath, fileType);
        sendResult({
          type: "cv_parsed",
          data: {
            cv_id: cvId,
            text: result.rawText,
            lines: result.lines,
            parsed: result.parsed,
            pageCount: result.pageCount,
            metadata: result.metadata,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendResult({
          type: "error",
          data: { cv_id: cvId, message: `CV parsing failed: ${msg}` },
        });
      }
      break;
    }

    default: {
      sendResult({
        type: "error",
        data: { message: `Unknown action: ${String((command as ScrapeCommand).action)}` },
      });
    }
  }
}

async function processLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const command: ScrapeCommand = JSON.parse(trimmed);
    await handleCommand(command);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendResult({
      type: "error",
      data: { message: `Failed to parse command: ${msg}` },
    });
  }
}

function main(): void {
  process.stderr.write(`[sidecar] Joseador Remoto sidecar v${VERSION} (CV parser) starting...\n`);

  let buffer = "";

  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      processLine(line).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[sidecar] Unhandled error processing line: ${msg}\n`);
        sendResult({
          type: "error",
          data: { message: `Internal error: ${msg}` },
        });
      });
    }
  });

  process.stdin.on("end", () => {
    if (buffer.trim()) {
      processLine(buffer).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[sidecar] Unhandled error on final buffer: ${msg}\n`);
      });
    }
  });

  process.on("SIGINT", () => {
    process.stderr.write("[sidecar] Received SIGINT, shutting down...\n");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    process.stderr.write("[sidecar] Received SIGTERM, shutting down...\n");
    process.exit(0);
  });
}

main();
