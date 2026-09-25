import type { CvRecord } from "@/types";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { markdownToPlainText } from "@/lib/cv/markdown-blocks";
import { sanitizeFileName } from "@/lib/files/sanitize-file-name";

/**
 * Single source of truth for "what is the document of this CV".
 *
 * - Tailored CVs: the canonical content is the markdown in `raw_text` (what the user saw
 *   and approved); `parsed_data` is a derived structure.
 * - Uploaded CVs: `raw_text` is the text extracted from the PDF/DOCX, and the markdown
 *   rendering is generated from `parsed_data`.
 */

const MAX_TAILORED_NAME = 120;

function isTailored(cv: CvRecord): boolean {
  return cv.source === "tailored";
}

function hasCompany(company: string | null | undefined): company is string {
  const c = (company ?? "").trim();
  return !!c && c.toLowerCase() !== "unknown company";
}

/** Markdown used for preview/export. */
export function getCvExportMarkdown(cv: CvRecord): string {
  const raw = cv.raw_text ?? "";
  if (isTailored(cv) && raw.trim()) return raw;
  return formatCvAsMarkdown(cv.parsed_data);
}

/** Plain text (no markdown syntax) for ATS checks, prompts and keyword matching. */
export function getCvPlainText(cv: CvRecord): string {
  const raw = cv.raw_text ?? "";
  if (!raw.trim()) return markdownToPlainText(formatCvAsMarkdown(cv.parsed_data));
  return isTailored(cv) ? markdownToPlainText(raw) : raw;
}

/** True when the structured data has anything worth showing (name, roles, skills, education). */
export function hasParsedContent(cv: CvRecord): boolean {
  const p = cv.parsed_data;
  if (!p) return false;
  return !!(
    p.full_name?.trim() ||
    (p.experience?.length ?? 0) > 0 ||
    (p.skills?.technical?.length ?? 0) > 0 ||
    (p.skills?.soft?.length ?? 0) > 0 ||
    (p.education?.length ?? 0) > 0
  );
}

/** "CV optimizado – Backend Engineer @ Acme" (company omitted when unknown), max 120 chars. */
export function defaultTailoredCvName(
  prefix: string,
  jobTitle: string,
  company: string | null,
): string {
  const head = (prefix ?? "").replace(/\s+/g, " ").trim();
  const title = (jobTitle ?? "").replace(/\s+/g, " ").trim();
  const detail = [title, hasCompany(company) ? `@ ${company.replace(/\s+/g, " ").trim()}` : ""]
    .filter(Boolean)
    .join(" ");
  const name = head && detail ? `${head} – ${detail}` : head || detail;
  const chars = Array.from(name);
  if (chars.length <= MAX_TAILORED_NAME) return name;
  return `${chars.slice(0, MAX_TAILORED_NAME - 1).join("").trimEnd()}…`;
}

/** "Juan Perez - CV - Acme.pdf" / "Juan Perez - CV.pdf" / "CV.pdf". */
export function buildCvExportFileName(
  p: { fullName: string; company?: string | null },
  ext: "pdf" | "docx" | "md",
): string {
  const fullName = (p.fullName ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) return sanitizeFileName("CV", ext, "CV");
  const base = hasCompany(p.company)
    ? `${fullName} - CV - ${p.company.replace(/\s+/g, " ").trim()}`
    : `${fullName} - CV`;
  return sanitizeFileName(base, ext, "CV");
}

function newestFirst(a: CvRecord, b: CvRecord): number {
  return (b.created_at ?? 0) - (a.created_at ?? 0);
}

/**
 * Default CV selection: the newest tailored CV targeting `jobId` → the primary CV → the
 * newest uploaded CV → the first CV → null.
 */
export function pickDefaultCv(cvs: CvRecord[], jobId?: string | null): CvRecord | null {
  if (!cvs || cvs.length === 0) return null;
  if (jobId) {
    const tailored = cvs
      .filter((cv) => cv.source === "tailored" && cv.target_job_id === jobId)
      .sort(newestFirst)[0];
    if (tailored) return tailored;
  }
  const primary = cvs.find((cv) => cv.is_primary);
  if (primary) return primary;
  const upload = cvs.filter((cv) => (cv.source ?? "upload") === "upload").sort(newestFirst)[0];
  return upload ?? cvs[0];
}
