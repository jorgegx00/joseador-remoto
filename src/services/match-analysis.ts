import { ulid } from "ulid";
import { LlmService } from "@/lib/llm/service";
import { fingerprintCv, fingerprintJob } from "@/lib/utils/fingerprint";
import { getCvById, getJobById, getMatchAnalysis, upsertMatchAnalysis } from "./database";
import { getActiveLlmConfig } from "./llm-active";
import type { CvRecord, Job, MatchAnalysis, MatchAnalysisRecord } from "@/types";

export interface MatchAnalysisResult {
  analysis: MatchAnalysis;
  /** True when served from the match_analyses cache (no LLM call). */
  cached: boolean;
  /**
   * True when the CV or job content changed since the cached analysis was computed.
   * Null when unknown (legacy rows without fingerprints).
   */
  stale: boolean | null;
}

/** Staleness of a cached analysis relative to the current CV/job content. */
export function analysisStaleness(
  record: Pick<MatchAnalysisRecord, "cv_fingerprint" | "job_fingerprint">,
  cv: CvRecord,
  job: Job,
): boolean | null {
  if (!record.cv_fingerprint || !record.job_fingerprint) return null;
  return (
    record.cv_fingerprint !== fingerprintCv(cv.parsed_data) ||
    record.job_fingerprint !== fingerprintJob(job)
  );
}

/** Cached analysis for (cv, job), or null. Never calls the LLM. */
export async function getCachedMatchAnalysis(
  cvId: string,
  jobId: string,
): Promise<MatchAnalysisResult | null> {
  const [record, cv, job] = await Promise.all([
    getMatchAnalysis(cvId, jobId),
    getCvById(cvId),
    getJobById(jobId),
  ]);
  if (!record) return null;
  const stale = cv && job ? analysisStaleness(record, cv, job) : null;
  return { analysis: record.analysis, cached: true, stale };
}

/**
 * The single entry point for CV↔job match analysis (used by the Match Analysis page, the
 * LLM store and the CV optimizer). Returns the cached analysis unless `force` is set;
 * otherwise runs the LLM and caches the result with content fingerprints.
 */
export async function getOrRunMatchAnalysis(
  cvId: string,
  jobId: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<MatchAnalysisResult> {
  const [cv, job] = await Promise.all([getCvById(cvId), getJobById(jobId)]);
  if (!cv) throw new Error("CV not found");
  if (!job) throw new Error("Job not found");

  if (!options.force) {
    const record = await getMatchAnalysis(cvId, jobId);
    if (record) {
      return { analysis: record.analysis, cached: true, stale: analysisStaleness(record, cv, job) };
    }
  }

  const config = await getActiveLlmConfig();
  if (!config) throw new Error("No LLM provider selected");

  const analysis = await new LlmService(config).analyzeCvMatch(
    cv.parsed_data,
    job,
    options.signal,
  );

  await upsertMatchAnalysis({
    id: ulid(),
    cv_id: cvId,
    job_id: jobId,
    analysis,
    llm_provider: config.provider,
    llm_model: config.model,
    cv_fingerprint: fingerprintCv(cv.parsed_data),
    job_fingerprint: fingerprintJob(job),
    created_at: Date.now(),
  });

  return { analysis, cached: false, stale: false };
}
