import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getAllCvs,
  getCvById,
  insertCv,
  updateCvParsedData,
  updateCvName,
  setCvPrimary,
  deleteCv as dbDeleteCv,
} from "./database";
import { parseTailoredMarkdown } from "./tailored-cv";
import { getActiveLlmConfig } from "./llm-active";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { ulid } from "ulid";
import type { ParsedCv, AtsReport, AtsCheckResult, KeywordMatch, AtsIssue, CvRecord, CvLayoutLine } from "@/types";

// --------------------------------------------------------------------------
// CV file management
// --------------------------------------------------------------------------

export const cvService = {
  async uploadCv(): Promise<string> {
    // Open native file picker via Tauri command
    const filePath = await invoke<string | null>("pick_cv_file");
    if (!filePath) {
      throw new Error("No file selected");
    }

    // Determine file type from extension
    const lowerPath = filePath.toLowerCase();
    let fileType: "pdf" | "docx" = "pdf";
    if (lowerPath.endsWith(".docx")) {
      fileType = "docx";
    }

    // Extract file name
    const segments = filePath.replace(/\\/g, "/").split("/");
    const fileName = segments[segments.length - 1] ?? "unknown";

    // Copy file to app data directory
    const cvId = ulid();
    const destName = `${cvId}.${fileType}`;
    const destPath = await invoke<string>("copy_file_to_app_data", {
      source: filePath,
      destName,
    });

    // Create DB record
    const emptyParsed = createEmptyParsedCv();
    await insertCv({
      id: cvId,
      name: fileName,
      file_path: destPath,
      file_type: fileType,
      raw_text: "",
      parsed_data: emptyParsed,
      is_primary: false,
      source: "upload",
    });

    return cvId;
  },

  async parseCv(cvId: string): Promise<void> {
    const cv = await getCvById(cvId);
    if (!cv) {
      throw new Error(`CV not found: ${cvId}`);
    }

    // Tailored CVs have no source file: their markdown is the content. Never send
    // them to the sidecar (it only understands pdf/docx).
    if (cv.file_type === "md" || cv.source === "tailored") {
      const parent = cv.parent_cv_id ? await getCvById(cv.parent_cv_id) : null;
      const { parsed } = await parseTailoredMarkdown(
        cv.raw_text,
        parent?.parsed_data ?? null,
        await getActiveLlmConfig().catch(() => null),
      );
      await updateCvParsedData(cvId, cv.raw_text, parsed);
      return;
    }

    // Send parse command to sidecar
    const status = await invoke<string>("get_sidecar_status");
    if (status === "stopped") {
      await invoke("start_sidecar");
    }

    type ParsedPayload = { text: string; parsed: ParsedCv; lines?: CvLayoutLine[] };
    let resolveParsed!: (value: ParsedPayload) => void;
    let rejectParsed!: (reason: unknown) => void;
    const parsedPromise = new Promise<ParsedPayload>((resolve, reject) => {
      resolveParsed = resolve;
      rejectParsed = reject;
    });

    const unlistenParsed = await listen<{ cv_id: string } & ParsedPayload>(
      "scraper:cv-parsed",
      (event) => {
        const payload = event.payload;
        if (payload.cv_id === cvId) {
          resolveParsed({ text: payload.text, parsed: payload.parsed, lines: payload.lines });
        }
      },
    );

    const unlistenError = await listen<{ cv_id?: string; message: string }>(
      "scraper:error",
      (event) => {
        const payload = event.payload;
        if (payload.cv_id === cvId) {
          rejectParsed(new Error(payload.message));
        }
      },
    );

    const timeout = setTimeout(() => {
      rejectParsed(new Error("CV parsing timed out after 120 seconds"));
    }, 120_000);

    try {
      await invoke("send_sidecar_command", {
        command: JSON.stringify({
          action: "parse_cv",
          file_path: cv.file_path,
          file_type: cv.file_type,
          cv_id: cvId,
        }),
      });

      const { text, parsed, lines } = await parsedPromise;
      await updateCvParsedData(cvId, text, parsed, lines && lines.length > 0 ? lines : null);
    } finally {
      clearTimeout(timeout);
      unlistenParsed();
      unlistenError();
    }
  },

  async getCvs(): Promise<CvRecord[]> {
    return getAllCvs();
  },

  async getCv(id: string): Promise<CvRecord | null> {
    return getCvById(id);
  },

  async updateCvData(id: string, parsedData: ParsedCv): Promise<void> {
    const cv = await getCvById(id);
    if (!cv) {
      throw new Error(`CV not found: ${id}`);
    }
    // Editors (CvEditor, the LLM refine dialog) don't know about extra_sections;
    // carry them over so an edit never drops sections.
    const merged: ParsedCv =
      parsedData.extra_sections === undefined && cv.parsed_data.extra_sections
        ? { ...parsedData, extra_sections: cv.parsed_data.extra_sections }
        : parsedData;
    // For tailored CVs the markdown is what gets exported — keep it in sync with edits.
    const rawText = cv.source === "tailored" ? formatCvAsMarkdown(merged) : cv.raw_text;
    await updateCvParsedData(id, rawText, merged);
  },

  async renameCv(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("CV name cannot be empty");
    await updateCvName(id, trimmed);
  },

  async setPrimaryCv(id: string): Promise<void> {
    await setCvPrimary(id);
  },

  async deleteCv(id: string): Promise<void> {
    await dbDeleteCv(id);
  },

  async duplicateCv(id: string, newName: string): Promise<string> {
    const original = await getCvById(id);
    if (!original) {
      throw new Error(`CV not found: ${id}`);
    }

    const newId = ulid();

    // Tailored CVs have no physical file — their markdown lives in raw_text.
    let destPath = "";
    if (original.file_path && original.file_type !== "md") {
      destPath = await invoke<string>("copy_file_to_app_data", {
        source: original.file_path,
        destName: `${newId}.${original.file_type}`,
      });
    }

    // Insert a new CV record with the same parsed data and provenance
    await insertCv({
      id: newId,
      name: newName,
      file_path: destPath,
      file_type: original.file_type,
      raw_text: original.raw_text,
      parsed_data: original.parsed_data,
      is_primary: false,
      source: original.source,
      parent_cv_id: original.parent_cv_id,
      target_job_id: original.target_job_id,
      target_job_title: original.target_job_title,
      target_company: original.target_company,
      generated_cv_id: null,
    });

    return newId;
  },
};

// --------------------------------------------------------------------------
// Utility functions (kept from original file)
// --------------------------------------------------------------------------

export function createEmptyParsedCv(): ParsedCv {
  return {
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin_url: "",
    github_url: "",
    portfolio_url: "",
    summary: "",
    skills: { technical: [], soft: [] },
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    languages: [],
  };
}

export function calculateAtsScore(checks: AtsCheckResult[]): number {
  if (checks.length === 0) return 0;
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(
    checks.reduce((sum, check) => sum + check.score * check.weight, 0) / totalWeight,
  );
}

export function createEmptyAtsReport(cvId: string, jobId: string | null): AtsReport {
  const emptyKeywordMatch: KeywordMatch = {
    matched: [],
    missing: [],
    partial: [],
  };
  const emptyIssues: AtsIssue[] = [];
  const emptyChecks: AtsCheckResult[] = [];

  return {
    id: "",
    cv_id: cvId,
    job_id: jobId,
    ats_score: 0,
    keyword_score: 0,
    format_score: 0,
    structure_score: 0,
    contact_score: 0,
    consistency_score: 0,
    spelling_score: 0,
    length_score: 0,
    keyword_matches: emptyKeywordMatch,
    issues: emptyIssues,
    checks: emptyChecks,
    narrative_report: "",
    narrative_scores: null,
    created_at: Date.now(),
  };
}

export function validateParsedCv(cv: ParsedCv): AtsIssue[] {
  const issues: AtsIssue[] = [];

  if (!cv.email) {
    issues.push({
      check: "contact_data",
      severity: "critical",
      message: "Email address is missing",
      fix: "Add a professional email address to your resume",
    });
  }

  if (!cv.phone) {
    issues.push({
      check: "contact_data",
      severity: "warning",
      message: "Phone number is missing",
      fix: "Add a phone number with international format",
    });
  }

  if (!cv.summary || cv.summary.length < 50) {
    issues.push({
      check: "section_structure",
      severity: "warning",
      message: "Professional summary is too short or missing",
      fix: "Add a 2-3 sentence professional summary highlighting your key qualifications",
    });
  }

  if (cv.experience.length === 0) {
    issues.push({
      check: "section_structure",
      severity: "critical",
      message: "No work experience listed",
      fix: "Add your work experience with descriptions and achievements",
    });
  }

  if (cv.skills.technical.length === 0) {
    issues.push({
      check: "keyword_match",
      severity: "warning",
      message: "No technical skills listed",
      fix: "Add a skills section with relevant technologies and tools",
    });
  }

  return issues;
}

export function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "and", "or", "but", "in",
    "on", "at", "to", "for", "of", "with", "by", "from", "as", "into",
    "through", "during", "before", "after", "above", "below", "between",
    "el", "la", "los", "las", "un", "una", "de", "del", "en", "con",
    "por", "para", "que", "es", "son", "fue", "ser", "estar", "y", "o",
  ]);
  return [...new Set(words.filter((w) => w.length > 2 && !stopWords.has(w)))];
}
