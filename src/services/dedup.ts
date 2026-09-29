/**
 * Frontend deduplication service.
 *
 * Runs at the DB level: when a batch of scraped jobs arrives from the sidecar,
 * this service checks each job against the database, merges duplicates, and
 * inserts new records.  Returns aggregate stats for the scrape run.
 */

import { getJobByCanonicalKey, getJobByExternalId, getAllJobs, upsertJob, findOrCreateCompanyByName } from "./database";
import { ulid } from "ulid";
import type { Job, DrEligibility } from "@/types";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

/** Shape of a scraped job produced by the ingest pipeline (src/services/ingest/map.ts). */
export interface IncomingScrapedJob {
  external_id: string;
  title: string;
  company_name: string;
  company_website?: string;
  description: string;
  location: string;
  source: string;
  source_url: string;
  apply_url: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  employment_type?: string;
  seniority_level?: string;
  skills_required: string[];
  posted_at?: number;
  expires_at?: number;
  is_dr_friendly?: boolean;
  dr_filter_reason?: string;
  dr_eligibility?: DrEligibility;
  /** Stable posting identity when the source knows it ("gh:123" from a company board). */
  canonical_key?: string;
  /**
   * True when a critical field (title/company/description) couldn't be
   * extracted. The job is persisted anyway with raw_payload preserved so the
   * LLM recovery flow can fix it later — never silently dropped.
   */
  needs_recovery?: boolean;
  raw_payload?: string;
}

export interface DedupStats {
  total: number;
  new: number;
  duplicates: number;
  merged: number;
}

// -------------------------------------------------------------------------
// Text normalization (mirrors sidecar dedup logic)
// -------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toWordSet(text: string): Set<string> {
  const words = normalize(text).split(" ");
  const result = new Set<string>();
  for (const w of words) {
    if (w.length >= 2) {
      result.add(w);
    }
  }
  return result;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const word of smaller) {
    if (larger.has(word)) {
      intersection++;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function generateFingerprint(job: { title: string; company_name: string; description: string }): string {
  const titleNorm = normalize(job.title);
  const companyNorm = normalize(job.company_name);
  const descSnippet = normalize(job.description).slice(0, 100);
  return `${titleNorm}|||${companyNorm}|||${descSnippet}`;
}

const FINGERPRINT_THRESHOLD = 0.85;

// -------------------------------------------------------------------------
// Source priority (for merge decisions)
// -------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<string, number> = {
  // Pasted by the user on purpose: never overwritten by a scraped duplicate.
  manual: 5,
  career_page: 4,
  aggregator: 3,
  linkedin: 2,
  google_jobs: 1,
  glassdoor: 0,
};

// -------------------------------------------------------------------------
// Find a fuzzy duplicate among existing DB jobs
// -------------------------------------------------------------------------

/**
 * Existing jobs a scraped job may be fuzzy-merged into. Pasted ("manual") jobs are
 * excluded: the user entered them deliberately, so a scraped look-alike must never
 * merge into (and overwrite) one; it is stored as its own row instead.
 */
export function fuzzyMergeCandidates(jobs: Job[]): Job[] {
  return jobs.filter((job) => job.source !== "manual");
}

function findFuzzyDuplicate(
  incoming: IncomingScrapedJob,
  existingJobs: Job[],
): Job | null {
  const fp = generateFingerprint(incoming);
  const fpWords = toWordSet(fp);
  const inTitleNorm = normalize(incoming.title);
  const inCompanyNorm = normalize(incoming.company_name);

  let bestMatch: Job | null = null;
  let bestScore = 0;

  for (const existing of existingJobs) {
    // Title + company exact match (normalized)
    const exTitleNorm = normalize(existing.title);
    const exCompanyNorm = normalize(
      // The DB Job doesn't have company_name directly — it uses company_id.
      // We fall back to empty so it doesn't false-positive on structural mismatch.
      "",
    );
    if (
      inTitleNorm === exTitleNorm &&
      exCompanyNorm.length > 0 &&
      inCompanyNorm === exCompanyNorm
    ) {
      return existing;
    }

    // Fingerprint similarity
    const existingFp = generateFingerprint({
      title: existing.title,
      company_name: "", // We don't have the company name on the Job object
      description: existing.description,
    });
    const exWords = toWordSet(existingFp);
    const sim = jaccardSimilarity(fpWords, exWords);

    if (sim >= FINGERPRINT_THRESHOLD && sim > bestScore) {
      bestMatch = existing;
      bestScore = sim;
    }
  }

  return bestMatch;
}

// -------------------------------------------------------------------------
// Merge incoming data into an existing DB job
// -------------------------------------------------------------------------

function mergeIntoExisting(existing: Job, incoming: IncomingScrapedJob): Omit<Job, "created_at"> {
  const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
  const incomingPriority = SOURCE_PRIORITY[incoming.source] ?? 0;
  const preferIncoming = incomingPriority > existingPriority;
  const needsRecovery = existing.needs_recovery && (incoming.needs_recovery ?? false);

  // Keep the longest description
  const description =
    incoming.description.length > existing.description.length
      ? incoming.description
      : existing.description;

  // Union skills
  const skillSet = new Map<string, string>();
  for (const skill of existing.skills_required) {
    skillSet.set(skill.toLowerCase(), skill);
  }
  for (const skill of incoming.skills_required) {
    const key = skill.toLowerCase();
    if (!skillSet.has(key)) {
      skillSet.set(key, skill);
    }
  }

  // An LLM-adjudicated DR verdict ("AI: …") survives a re-scrape that only has
  // the keyword answer ("ambiguous") — otherwise every scrape would undo (and
  // pay again for) the adjudication.
  const keepAiDr =
    existing.dr_filter_reason.startsWith("AI:") && (incoming.dr_eligibility ?? "ambiguous") === "ambiguous";

  // Earliest posted_at
  let postedAt: number;
  if (incoming.posted_at != null) {
    postedAt = Math.min(existing.posted_at, incoming.posted_at);
  } else {
    postedAt = existing.posted_at;
  }

  return {
    id: existing.id,
    external_id: existing.external_id || incoming.external_id,
    company_id: existing.company_id,
    company_name: existing.company_name,
    title: preferIncoming && incoming.title !== "Unknown Title"
      ? incoming.title
      : existing.title,
    description,
    location: preferIncoming
      ? incoming.location || existing.location
      : existing.location || incoming.location,
    is_dr_friendly: keepAiDr ? existing.is_dr_friendly : incoming.is_dr_friendly ?? existing.is_dr_friendly,
    dr_filter_reason: keepAiDr ? existing.dr_filter_reason : incoming.dr_filter_reason ?? existing.dr_filter_reason,
    dr_eligibility: keepAiDr ? existing.dr_eligibility : incoming.dr_eligibility ?? existing.dr_eligibility,
    // Carried so upsertJob's recompute can keep AI-adjudicated market verdicts.
    location_scope: existing.location_scope,
    market_eligibility: existing.market_eligibility,
    canonical_key: existing.canonical_key ?? incoming.canonical_key ?? null,
    source: preferIncoming ? (incoming.source as Job["source"]) : existing.source,
    source_url: preferIncoming
      ? incoming.source_url || existing.source_url
      : existing.source_url || incoming.source_url,
    apply_url: preferIncoming
      ? incoming.apply_url || existing.apply_url
      : existing.apply_url || incoming.apply_url,
    salary_min: (preferIncoming ? incoming.salary_min : existing.salary_min) ??
      existing.salary_min ?? incoming.salary_min ?? null,
    salary_max: (preferIncoming ? incoming.salary_max : existing.salary_max) ??
      existing.salary_max ?? incoming.salary_max ?? null,
    salary_currency: (preferIncoming
      ? incoming.salary_currency
      : existing.salary_currency) ??
      existing.salary_currency ?? incoming.salary_currency ?? "USD",
    employment_type: (preferIncoming
      ? (incoming.employment_type as Job["employment_type"]) || existing.employment_type
      : existing.employment_type) ?? "full_time",
    seniority_level: (preferIncoming
      ? (incoming.seniority_level as Job["seniority_level"]) || existing.seniority_level
      : existing.seniority_level) ?? "mid",
    skills_required: Array.from(skillSet.values()),
    posted_at: postedAt,
    expires_at: existing.expires_at ?? (incoming.expires_at ?? null),
    scraped_at: Date.now(),
    // Recovery is only still needed when BOTH records are flagged — either
    // side having clean fields resolves it (and the payload can be dropped).
    needs_recovery: needsRecovery,
    raw_payload: needsRecovery
      ? (incoming.raw_payload ?? existing.raw_payload)
      : null,
  };
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export const dedupService = {
  /**
   * Deduplicate a batch of scraped jobs against the database, saving new
   * ones and merging duplicates.  Returns aggregate stats.
   */
  async deduplicateAndSave(jobs: IncomingScrapedJob[]): Promise<DedupStats> {
    const stats: DedupStats = {
      total: jobs.length,
      new: 0,
      duplicates: 0,
      merged: 0,
    };

    // Pre-load all existing jobs for fuzzy matching (pasted jobs are never merge targets)
    const existingJobs = fuzzyMergeCandidates(await getAllJobs());

    for (const incoming of jobs) {
      // ----- Step 1: exact identity match (capture key, then external_id) -----
      let existingJob: Job | null = null;
      if (incoming.canonical_key) {
        existingJob = await getJobByCanonicalKey(incoming.canonical_key);
      }
      if (!existingJob && incoming.external_id) {
        existingJob = await getJobByExternalId(incoming.external_id);
      }

      // ----- Step 2: fuzzy match if no exact hit -----
      if (!existingJob) {
        existingJob = findFuzzyDuplicate(incoming, existingJobs);
      }

      if (existingJob) {
        // Merge and update
        const merged = mergeIntoExisting(existingJob, incoming);
        await upsertJob(merged);
        stats.duplicates++;
        stats.merged++;
      } else {
        // Insert as new job

        // Reuse the existing company row when one matches by name —
        // otherwise every scrape run duplicates companies.
        // external_id is "<adapter-name>:<fingerprint>", so the prefix
        // recovers the source adapter for the company row.
        const companyId = await findOrCreateCompanyByName(
          incoming.company_name,
          incoming.company_website,
          incoming.external_id.split(":")[0] || incoming.source,
        );

        const jobId = ulid();
        await upsertJob({
          id: jobId,
          external_id: incoming.external_id,
          company_id: companyId,
          company_name: incoming.company_name,
          title: incoming.title,
          description: incoming.description,
          location: incoming.location ?? "",
          is_dr_friendly: incoming.is_dr_friendly ?? false,
          dr_filter_reason: incoming.dr_filter_reason ?? "",
          dr_eligibility: incoming.dr_eligibility ?? null,
          source: incoming.source as Job["source"],
          source_url: incoming.source_url ?? "",
          apply_url: incoming.apply_url ?? "",
          salary_min: incoming.salary_min ?? null,
          salary_max: incoming.salary_max ?? null,
          salary_currency: incoming.salary_currency ?? "USD",
          employment_type: (incoming.employment_type ?? "full_time") as Job["employment_type"],
          seniority_level: (incoming.seniority_level ?? "mid") as Job["seniority_level"],
          skills_required: incoming.skills_required ?? [],
          posted_at: incoming.posted_at ?? Date.now(),
          expires_at: incoming.expires_at ?? null,
          scraped_at: Date.now(),
          needs_recovery: incoming.needs_recovery ?? false,
          raw_payload: incoming.raw_payload ?? null,
          canonical_key: incoming.canonical_key ?? null,
        });

        // Add to local cache so later jobs in this batch can fuzzy-match
        existingJobs.push({
          id: jobId,
          external_id: incoming.external_id,
          company_id: companyId,
          company_name: incoming.company_name,
          title: incoming.title,
          description: incoming.description,
          location: incoming.location ?? "",
          is_dr_friendly: incoming.is_dr_friendly ?? false,
          dr_filter_reason: incoming.dr_filter_reason ?? "",
          dr_eligibility: incoming.dr_eligibility ?? null,
          source: incoming.source as Job["source"],
          source_url: incoming.source_url ?? "",
          apply_url: incoming.apply_url ?? "",
          salary_min: incoming.salary_min ?? null,
          salary_max: incoming.salary_max ?? null,
          salary_currency: incoming.salary_currency ?? "USD",
          employment_type: (incoming.employment_type ?? "full_time") as Job["employment_type"],
          seniority_level: (incoming.seniority_level ?? "mid") as Job["seniority_level"],
          skills_required: incoming.skills_required ?? [],
          posted_at: incoming.posted_at ?? Date.now(),
          expires_at: incoming.expires_at ?? null,
          scraped_at: Date.now(),
          created_at: Date.now(),
          needs_recovery: incoming.needs_recovery ?? false,
          raw_payload: incoming.raw_payload ?? null,
        });

        stats.new++;
      }
    }

    return stats;
  },
};
