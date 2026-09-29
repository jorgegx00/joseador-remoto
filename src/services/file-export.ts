import { invoke } from "@tauri-apps/api/core";
import type { CvExportFormat, CvExportMeta } from "@/lib/cv/export/types";
import { sanitizeFileName } from "@/lib/files/sanitize-file-name";
import { getCvExportMarkdown, buildCvExportFileName } from "@/lib/cv/cv-document";
import type { CvRecord } from "@/types";
import { getJobById } from "@/services/database";
import { getMarketProfile } from "@/services/market-profile";
import { cvMarketsForJob, cvRulesForMarkets } from "@/lib/markets/cv-rules";
import { getCountryProfile } from "@/lib/markets/countries";

/**
 * Paper size for a CV: the tailored job's market conventions, else the paper used
 * where the user lives (Letter in the Americas' Letter countries, A4 elsewhere).
 */
async function pageSizeFor(cv: CvRecord): Promise<"LETTER" | "A4"> {
  const profile = getMarketProfile();
  if (cv.target_job_id) {
    const job = await getJobById(cv.target_job_id).catch(() => null);
    if (job) return cvRulesForMarkets(cvMarketsForJob(job, profile.targetMarkets)).paper;
  }
  return getCountryProfile(profile.residenceCountry).paper;
}

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
    meta: {
      ...cvExportMeta(fullName, cv.target_job_title, cv.parsed_data.skills.technical),
      pageSize: await pageSizeFor(cv),
    },
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
