import { invoke } from "@tauri-apps/api/core";
import type { CvExportFormat, CvExportMeta } from "@/lib/cv/export/types";
import { sanitizeFileName } from "@/lib/files/sanitize-file-name";
import { getCvExportMarkdown, buildCvExportFileName } from "@/lib/cv/cv-document";
import type { CvRecord } from "@/types";

export const EXPORT_FILTERS: Record<CvExportFormat, { name: string; extensions: string[] }> = {
  pdf: { name: "PDF", extensions: ["pdf"] },
  docx: { name: "Word document", extensions: ["docx"] },
  md: { name: "Markdown", extensions: ["md"] },
};

/**
 * Opens the native "Save As" dialog (filtered to the format) and writes `bytes` to the
 * chosen path. Returns the saved path, or null when the user cancels the dialog.
 */
export async function saveBytesWithDialog(
  defaultName: string,
  format: CvExportFormat,
  bytes: Uint8Array,
): Promise<string | null> {
  const filter = EXPORT_FILTERS[format];
  // A JSON number array is the simplest IPC encoding that maps to Vec<u8>; CV-sized
  // files (tens to hundreds of KB) serialize fine this way.
  return invoke<string | null>("save_binary_file", {
    defaultName,
    filterName: filter.name,
    extensions: filter.extensions,
    contents: Array.from(bytes),
  });
}

/**
 * Renders CV markdown to the requested format (PDF/DOCX libraries are loaded lazily)
 * and asks the user where to save it. Returns the saved path, or null on cancel.
 */
export async function exportMarkdownToFile(
  markdown: string,
  format: CvExportFormat,
  opts: { fileName: string; meta: CvExportMeta },
): Promise<string | null> {
  const { renderCvDocument } = await import("./cv-export");
  const bytes = await renderCvDocument(markdown, format, opts.meta);
  // Callers may pass a name built for another format ("CV.pdf") — never produce "CV.pdf.docx".
  const baseName = opts.fileName.replace(/\.(pdf|docx|md)$/i, "");
  return saveBytesWithDialog(sanitizeFileName(baseName, format), format, bytes);
}

/** Exports any CV (uploaded or tailored) through the native Save As dialog. */
export async function exportCvToFile(cv: CvRecord, format: CvExportFormat): Promise<string | null> {
  const fullName = cv.parsed_data.full_name || cv.name;
  return exportMarkdownToFile(getCvExportMarkdown(cv), format, {
    fileName: buildCvExportFileName({ fullName, company: cv.target_company }, format),
    meta: cvExportMeta(fullName, cv.target_job_title, cv.parsed_data.skills.technical),
  });
}

export function cvExportMeta(fullName: string, jobTitle?: string | null, keywords: string[] = []): CvExportMeta {
  return {
    title: jobTitle ? `${fullName} — ${jobTitle}` : `${fullName} — CV`,
    author: fullName,
    subject: jobTitle ?? undefined,
    keywords: keywords.slice(0, 30),
  };
}
