import { drizzle } from "drizzle-orm/sqlite-proxy";
import { invoke } from "@tauri-apps/api/core";
import { eq, and, or, ne, desc, asc, like, sql, inArray, notInArray } from "drizzle-orm";
import { ulid } from "ulid";
import * as schema from "@/db/schema";
import { jobMatchesTagFilters } from "@/features/jobs/utils/jobTaxonomy";
import { emitPrepDocumentChanged } from "./prep-events";
import type { Job, JobSource, Company, CvRecord, NewCvRecord, ParsedCv, Application, ApplicationEvent, Interview, AtsReport, GeneratedCv, ScrapeRun, CoverLetter } from "@/types";
import type { StarStory, InterviewPrep, GlassdoorInterviewReview, MatchAnalysisRecord, MatchAnalysis } from "@/types";
import type { MockSession, PrepDocument, PrepDocumentKind, CvLayoutLine } from "@/types";

// --------------------------------------------------------------------------
// Drizzle sqlite-proxy bridge
// --------------------------------------------------------------------------

const db = drizzle(async (sqlText, params, method) => {
  try {
    const result = await invoke<{ rows: unknown[][] }>("execute_sql", {
      sql: sqlText,
      params: params.map((p) => (p === undefined ? null : p)),
    });

    if (method === "run") {
      return { rows: [] };
    }

    return { rows: result.rows ?? [] };
  } catch (error) {
    console.error("SQL Error:", error);
    throw error;
  }
}, { schema });

export { db };

// --------------------------------------------------------------------------
// Migration runner
// --------------------------------------------------------------------------

export async function runMigrations(): Promise<void> {
  const statements: string[] = [
    // --- companies ---
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT,
      careers_url TEXT,
      logo_url TEXT,
      scraper_id TEXT,
      is_nearshore INTEGER DEFAULT 1,
      headquarters_country TEXT,
      glassdoor_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_scraper_id ON companies (scraper_id)`,

    // --- jobs ---
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      company_id TEXT NOT NULL REFERENCES companies(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT,
      is_dr_friendly INTEGER DEFAULT 0,
      dr_filter_reason TEXT,
      dr_eligibility TEXT,
      source TEXT NOT NULL,
      source_url TEXT,
      apply_url TEXT,
      salary_min REAL,
      salary_max REAL,
      salary_currency TEXT DEFAULT 'USD',
      employment_type TEXT DEFAULT 'full_time',
      seniority_level TEXT,
      skills_required TEXT,
      posted_at INTEGER,
      expires_at INTEGER,
      scraped_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      needs_recovery INTEGER DEFAULT 0,
      raw_payload TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs (company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs (source)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_is_dr_friendly ON jobs (is_dr_friendly)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs (posted_at)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_seniority_level ON jobs (seniority_level)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_external_id ON jobs (external_id)`,
    // idx_jobs_needs_recovery is intentionally NOT here: on installs created
    // before the needs_recovery column existed, referencing it aborts the whole
    // batch BEFORE the additive ALTER below can add the column. The additive
    // entry creates the index after guaranteeing the column exists.

    // --- cvs ---
    `CREATE TABLE IF NOT EXISTS cvs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      raw_text TEXT,
      parsed_data TEXT,
      is_primary INTEGER DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'upload',
      parent_cv_id TEXT,
      target_job_id TEXT,
      target_job_title TEXT,
      target_company TEXT,
      generated_cv_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cvs_is_primary ON cvs (is_primary)`,
    // idx_cvs_source / idx_cvs_parent_cv_id live in the additive list below (same
    // reason as idx_jobs_needs_recovery: older installs lack the columns here).

    // --- generated_cvs ---
    `CREATE TABLE IF NOT EXISTS generated_cvs (
      id TEXT PRIMARY KEY,
      cv_id TEXT NOT NULL REFERENCES cvs(id),
      job_id TEXT NOT NULL REFERENCES jobs(id),
      content TEXT NOT NULL,
      match_score_before REAL,
      match_score_after REAL,
      llm_provider TEXT,
      llm_model TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_generated_cvs_cv_id ON generated_cvs (cv_id)`,
    `CREATE INDEX IF NOT EXISTS idx_generated_cvs_job_id ON generated_cvs (job_id)`,

    // --- applications ---
    `CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      cv_id TEXT NOT NULL REFERENCES cvs(id),
      generated_cv_id TEXT REFERENCES generated_cvs(id),
      status TEXT NOT NULL DEFAULT 'saved',
      applied_at INTEGER,
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications (job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_applications_cv_id ON applications (cv_id)`,
    `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status)`,

    // --- interviews ---
    `CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      scheduled_at INTEGER NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      interview_type TEXT NOT NULL,
      location TEXT,
      meeting_url TEXT,
      interviewer_name TEXT,
      interviewer_role TEXT,
      notes TEXT DEFAULT '',
      feedback TEXT DEFAULT '',
      outcome TEXT DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON interviews (application_id)`,
    `CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews (scheduled_at)`,
    `CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews (status)`,

    // --- application_events (status history, messages sent, notes) ---
    `CREATE TABLE IF NOT EXISTS application_events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      payload TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_application_events_application_id ON application_events (application_id)`,

    // --- prep_documents (LLM gap brief / round prep packs) ---
    `CREATE TABLE IF NOT EXISTS prep_documents (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      interview_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      language TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prep_documents_application_id ON prep_documents (application_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_prep_documents_unique ON prep_documents (application_id, interview_id, kind)`,

    // --- mock_sessions (practice interviews) ---
    `CREATE TABLE IF NOT EXISTS mock_sessions (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      interview_id TEXT NOT NULL DEFAULT '',
      interview_type TEXT NOT NULL,
      language TEXT NOT NULL,
      coaching_language TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      turns TEXT NOT NULL,
      report TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mock_sessions_application_id ON mock_sessions (application_id)`,

    // --- glassdoor_reviews ---
    `CREATE TABLE IF NOT EXISTS glassdoor_reviews (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      rating REAL,
      title TEXT,
      pros TEXT,
      cons TEXT,
      role TEXT,
      employment_status TEXT,
      review_date TEXT,
      helpful_count INTEGER DEFAULT 0,
      scraped_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_glassdoor_reviews_company_id ON glassdoor_reviews (company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_glassdoor_reviews_rating ON glassdoor_reviews (rating)`,

    // --- glassdoor_interview_reviews ---
    `CREATE TABLE IF NOT EXISTS glassdoor_interview_reviews (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      role_title TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      overall_experience TEXT NOT NULL,
      interview_process TEXT NOT NULL DEFAULT '',
      questions TEXT NOT NULL DEFAULT '[]',
      tips TEXT NOT NULL DEFAULT '',
      offer_received INTEGER NOT NULL DEFAULT 0,
      scraped_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_glassdoor_interview_reviews_company_id ON glassdoor_interview_reviews (company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_glassdoor_interview_reviews_difficulty ON glassdoor_interview_reviews (difficulty)`,
    `CREATE INDEX IF NOT EXISTS idx_glassdoor_interview_reviews_experience ON glassdoor_interview_reviews (overall_experience)`,

    // --- ats_reports ---
    `CREATE TABLE IF NOT EXISTS ats_reports (
      id TEXT PRIMARY KEY,
      cv_id TEXT NOT NULL REFERENCES cvs(id),
      job_id TEXT REFERENCES jobs(id),
      ats_score REAL NOT NULL,
      keyword_score REAL,
      format_score REAL,
      structure_score REAL,
      contact_score REAL,
      consistency_score REAL,
      spelling_score REAL,
      length_score REAL,
      keyword_matches TEXT,
      issues TEXT,
      checks TEXT,
      narrative_report TEXT,
      narrative_scores TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ats_reports_cv_id ON ats_reports (cv_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ats_reports_job_id ON ats_reports (job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ats_reports_ats_score ON ats_reports (ats_score)`,

    // --- star_stories ---
    `CREATE TABLE IF NOT EXISTS star_stories (
      id TEXT PRIMARY KEY,
      cv_id TEXT NOT NULL REFERENCES cvs(id),
      experience_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      situation TEXT NOT NULL,
      task TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      skills_demonstrated TEXT,
      is_user_edited INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_star_stories_cv_id ON star_stories (cv_id)`,

    // --- interview_preps ---
    `CREATE TABLE IF NOT EXISTS interview_preps (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      pitch_casual TEXT,
      pitch_formal TEXT,
      pitch_technical TEXT,
      strengths TEXT,
      weaknesses TEXT,
      company_brief TEXT,
      custom_questions TEXT,
      checklist_state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_interview_preps_application_id ON interview_preps (application_id)`,

    // --- cover_letters ---
    `CREATE TABLE IF NOT EXISTS cover_letters (
      id TEXT PRIMARY KEY,
      cv_id TEXT NOT NULL REFERENCES cvs(id),
      job_id TEXT NOT NULL REFERENCES jobs(id),
      content TEXT NOT NULL,
      tone TEXT DEFAULT 'professional',
      llm_provider TEXT,
      llm_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cover_letters_cv_id ON cover_letters (cv_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cover_letters_job_id ON cover_letters (job_id)`,

    // --- scrape_runs ---
    `CREATE TABLE IF NOT EXISTS scrape_runs (
      id TEXT PRIMARY KEY,
      scraper_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      jobs_found INTEGER DEFAULT 0,
      jobs_new INTEGER DEFAULT 0,
      searches_used INTEGER DEFAULT 0,
      error_message TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_scrape_runs_scraper_id ON scrape_runs (scraper_id)`,
    `CREATE INDEX IF NOT EXISTS idx_scrape_runs_status ON scrape_runs (status)`,
    `CREATE INDEX IF NOT EXISTS idx_scrape_runs_started_at ON scrape_runs (started_at)`,

    // --- settings ---
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // --- match_analyses ---
    `CREATE TABLE IF NOT EXISTS match_analyses (
      id TEXT PRIMARY KEY,
      cv_id TEXT NOT NULL REFERENCES cvs(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,
      llm_provider TEXT,
      llm_model TEXT,
      cv_fingerprint TEXT,
      job_fingerprint TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_match_analyses_cv_job ON match_analyses (cv_id, job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_match_analyses_cv_id ON match_analyses (cv_id)`,
    `CREATE INDEX IF NOT EXISTS idx_match_analyses_job_id ON match_analyses (job_id)`,

    // --- ingest_cursors (resume state for paid job-source pagination) ---
    `CREATE TABLE IF NOT EXISTS ingest_cursors (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // --- api_usage (paid-API budget counters; period is UTC YYYY-MM-DD or YYYY-MM) ---
    `CREATE TABLE IF NOT EXISTS api_usage (
      provider TEXT NOT NULL,
      period TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (provider, period)
    )`,
  ];

  await invoke("execute_batch", { statements });

  // Additive migrations for installs created before these columns existed.
  // ALTER TABLE ADD COLUMN errors with "duplicate column" on new installs where
  // the CREATE TABLE above already includes the column — we swallow that case only.
  const additive: Array<{ sql: string; index?: string }> = [
    {
      sql: `ALTER TABLE jobs ADD COLUMN needs_recovery INTEGER DEFAULT 0`,
      index: `CREATE INDEX IF NOT EXISTS idx_jobs_needs_recovery ON jobs (needs_recovery)`,
    },
    { sql: `ALTER TABLE jobs ADD COLUMN raw_payload TEXT` },
    {
      sql: `ALTER TABLE jobs ADD COLUMN dr_eligibility TEXT`,
      index: `CREATE INDEX IF NOT EXISTS idx_jobs_dr_eligibility ON jobs (dr_eligibility)`,
    },
    { sql: `ALTER TABLE scrape_runs ADD COLUMN searches_used INTEGER DEFAULT 0` },
    // Tailored CVs (optimized for a job, saved from the generator). No REFERENCES on
    // purpose: tailored CVs must survive job wipes and source-CV deletes.
    {
      sql: `ALTER TABLE cvs ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'`,
      index: `CREATE INDEX IF NOT EXISTS idx_cvs_source ON cvs (source)`,
    },
    {
      sql: `ALTER TABLE cvs ADD COLUMN parent_cv_id TEXT`,
      index: `CREATE INDEX IF NOT EXISTS idx_cvs_parent_cv_id ON cvs (parent_cv_id)`,
    },
    { sql: `ALTER TABLE cvs ADD COLUMN target_job_id TEXT` },
    { sql: `ALTER TABLE cvs ADD COLUMN target_job_title TEXT` },
    { sql: `ALTER TABLE cvs ADD COLUMN target_company TEXT` },
    { sql: `ALTER TABLE cvs ADD COLUMN generated_cv_id TEXT` },
    // Layout lines (font size, indentation, bullets) of uploaded CVs, for the LLM parser.
    { sql: `ALTER TABLE cvs ADD COLUMN layout_lines TEXT` },
    // Content fingerprints so a cached match analysis can be flagged stale when the
    // CV or job text changed after it was computed.
    { sql: `ALTER TABLE match_analyses ADD COLUMN cv_fingerprint TEXT` },
    { sql: `ALTER TABLE match_analyses ADD COLUMN job_fingerprint TEXT` },
    // Follow-up tracking for the application pipeline.
    { sql: `ALTER TABLE applications ADD COLUMN last_contact_at INTEGER` },
    { sql: `ALTER TABLE applications ADD COLUMN snoozed_until INTEGER` },
    { sql: `ALTER TABLE applications ADD COLUMN closed_reason TEXT` },
    { sql: `ALTER TABLE interviews ADD COLUMN interviewer_timezone TEXT` },
  ];
  for (const { sql: alterSql, index } of additive) {
    try {
      await invoke("execute_sql", { sql: alterSql, params: [] });
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("duplicate column")) {
        console.warn(`[migrations] additive migration skipped: ${msg}`);
      }
    }
    if (index) {
      try {
        await invoke("execute_sql", { sql: index, params: [] });
      } catch (err) {
        console.warn(`[migrations] index creation skipped: ${String(err)}`);
      }
    }
  }

  // One-off cleanup: settings left behind by the retired remote Jobs Service
  // (server removed 2026-06; scraping now runs in-app).
  try {
    await invoke("execute_sql", {
      sql: `DELETE FROM settings WHERE key LIKE 'jobs_service%' OR key LIKE 'api_key_jobs_service%'`,
      params: [],
    });
  } catch (err) {
    console.warn(`[migrations] jobs_service settings cleanup skipped: ${String(err)}`);
  }
}

// --------------------------------------------------------------------------
// Helper: convert raw row arrays to objects (Drizzle sqlite-proxy returns
// rows as arrays when using the low-level proxy).  The Drizzle ORM query
// builder handles this internally, but we expose helpers for manual queries.
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Job helpers
// --------------------------------------------------------------------------

export async function getAllJobs(): Promise<Job[]> {
  const blacklistedIds = await getBlacklistedCompanyIds();
  const rows = await db
    .select()
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(blacklistedIds.length > 0 ? notBlacklisted(blacklistedIds) : undefined)
    .orderBy(desc(schema.jobs.created_at));
  return rows.map((r) => mapJob(r.jobs, r.companies?.name));
}

/**
 * Blacklist condition. Pasted ("manual") jobs are always kept: the user entered them
 * on purpose, so hiding them behind a company blacklist would be surprising.
 */
function notBlacklisted(blacklistedIds: string[]) {
  return or(
    notInArray(schema.jobs.company_id, blacklistedIds),
    eq(schema.jobs.source, "manual"),
  );
}

/** Jobs of one source (no blacklist/DR filtering), newest first. */
export async function getJobsBySource(source: JobSource): Promise<Job[]> {
  const rows = await db
    .select()
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.jobs.source, source))
    .orderBy(desc(schema.jobs.created_at));
  return rows.map((r) => mapJob(r.jobs, r.companies?.name));
}

export async function getJobById(id: string): Promise<Job | null> {
  const rows = await db
    .select()
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.jobs.id, id))
    .limit(1);
  return rows.length > 0 ? mapJob(rows[0].jobs, rows[0].companies?.name) : null;
}

export async function getJobByExternalId(externalId: string): Promise<Job | null> {
  const rows = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.external_id, externalId))
    .limit(1);
  return rows.length > 0 ? mapJob(rows[0]) : null;
}

export async function upsertJob(job: Omit<Job, "created_at">): Promise<void> {
  const now = Date.now();
  await db
    .insert(schema.jobs)
    .values({
      id: job.id,
      external_id: job.external_id,
      company_id: job.company_id,
      title: job.title,
      description: job.description,
      location: job.location,
      is_dr_friendly: job.is_dr_friendly,
      dr_filter_reason: job.dr_filter_reason,
      dr_eligibility: job.dr_eligibility,
      source: job.source,
      source_url: job.source_url,
      apply_url: job.apply_url,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_currency: job.salary_currency,
      employment_type: job.employment_type,
      seniority_level: job.seniority_level,
      skills_required: JSON.stringify(job.skills_required),
      posted_at: job.posted_at,
      expires_at: job.expires_at,
      scraped_at: job.scraped_at,
      created_at: now,
      needs_recovery: job.needs_recovery,
      raw_payload: job.raw_payload,
    })
    .onConflictDoUpdate({
      target: schema.jobs.id,
      set: {
        company_id: job.company_id,
        title: job.title,
        description: job.description,
        location: job.location,
        is_dr_friendly: job.is_dr_friendly,
        dr_filter_reason: job.dr_filter_reason,
        dr_eligibility: job.dr_eligibility,
        source_url: job.source_url,
        apply_url: job.apply_url,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        employment_type: job.employment_type,
        seniority_level: job.seniority_level,
        skills_required: JSON.stringify(job.skills_required),
        posted_at: job.posted_at,
        expires_at: job.expires_at,
        scraped_at: job.scraped_at,
        needs_recovery: job.needs_recovery,
        raw_payload: job.raw_payload,
      },
    });
}

export async function getFilteredJobs(filters: import("@/types").JobFilters): Promise<Job[]> {
  const conditions = [];

  const blacklistedIds = await getBlacklistedCompanyIds();
  if (blacklistedIds.length > 0) {
    conditions.push(notBlacklisted(blacklistedIds));
  }

  const searchTokens = filters.search
    ? filters.search.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
    : [];
  if (searchTokens.length > 0) {
    // Cheap SQL prefilter on the longest token; precise word-boundary check happens in JS below.
    const longest = searchTokens.reduce((a, b) => (a.length >= b.length ? a : b));
    conditions.push(like(sql`lower(${schema.jobs.title})`, `%${longest}%`));
  }

  // Pasted ("manual") jobs bypass the location filters: the user chose them explicitly.
  if (filters.drFilter === "dr_friendly") {
    conditions.push(or(eq(schema.jobs.is_dr_friendly, true), eq(schema.jobs.source, "manual")));
  } else if (filters.drFilter === "explicit_latam") {
    conditions.push(
      or(eq(schema.jobs.dr_eligibility, "explicit_latam"), eq(schema.jobs.source, "manual")),
    );
  }
  // "all" → no location condition (includes restricted + ambiguous).

  if (filters.sources.length > 0) {
    conditions.push(
      or(...filters.sources.map((s) => eq(schema.jobs.source, s))),
    );
  }

  if (filters.seniorityLevels.length > 0) {
    conditions.push(
      or(...filters.seniorityLevels.map((s) => eq(schema.jobs.seniority_level, s))),
    );
  }

  if (filters.employmentTypes.length > 0) {
    conditions.push(
      or(...filters.employmentTypes.map((t) => eq(schema.jobs.employment_type, t))),
    );
  }

  if (filters.salaryMin !== null) {
    conditions.push(sql`${schema.jobs.salary_max} >= ${filters.salaryMin}`);
  }

  if (filters.salaryMax !== null) {
    conditions.push(sql`${schema.jobs.salary_min} <= ${filters.salaryMax}`);
  }

  if (filters.datePosted !== "all_time") {
    const now = Date.now();
    let since = 0;
    if (filters.datePosted === "today") {
      since = now - 24 * 60 * 60 * 1000;
    } else if (filters.datePosted === "this_week") {
      since = now - 7 * 24 * 60 * 60 * 1000;
    } else if (filters.datePosted === "this_month") {
      since = now - 30 * 24 * 60 * 60 * 1000;
    }
    conditions.push(sql`${schema.jobs.posted_at} >= ${since}`);
  }

  let orderBy;
  switch (filters.sortBy) {
    case "newest":
      orderBy = desc(schema.jobs.posted_at);
      break;
    case "salary_desc":
      orderBy = desc(schema.jobs.salary_max);
      break;
    case "company_asc":
      orderBy = asc(schema.companies.name);
      break;
    default:
      orderBy = desc(schema.jobs.created_at);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(whereClause)
    .orderBy(orderBy);

  let jobs = rows.map((r) => mapJob(r.jobs, r.companies?.name));

  if (searchTokens.length > 0) {
    jobs = jobs.filter((j) => {
      const haystack = ` ${j.title.toLowerCase()} ${(j.skills_required ?? []).join(" ").toLowerCase()} `
        .replace(/[^\p{L}\p{N}]+/gu, " ");
      return searchTokens.every((tok) => haystack.includes(` ${tok} `));
    });
  }

  // Derived tech tags aren't columns, so filter them in JS (same pattern as search).
  if (
    filters.languages.length > 0 ||
    filters.frameworks.length > 0 ||
    filters.roles.length > 0
  ) {
    jobs = jobs.filter((j) =>
      jobMatchesTagFilters(j, {
        languages: filters.languages,
        frameworks: filters.frameworks,
        roles: filters.roles,
      }),
    );
  }

  return jobs;
}

/**
 * DR-friendly jobs for the shareable report, newest first. `since` filters to
 * rows synced after the previous report (local insert time), or null for all.
 */
export async function getJobsForReport(since: number | null): Promise<Job[]> {
  // Pasted jobs are personal picks, not part of the shareable DR report.
  const conditions = [eq(schema.jobs.is_dr_friendly, true), ne(schema.jobs.source, "manual")];
  if (since !== null) {
    conditions.push(sql`${schema.jobs.created_at} > ${since}`);
  }
  const blacklistedIds = await getBlacklistedCompanyIds();
  if (blacklistedIds.length > 0) {
    conditions.push(notInArray(schema.jobs.company_id, blacklistedIds));
  }
  const rows = await db
    .select()
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions))
    .orderBy(desc(schema.jobs.posted_at));
  return rows.map((r) => mapJob(r.jobs, r.companies?.name));
}

function mapJob(row: typeof schema.jobs.$inferSelect, companyName?: string | null): Job {
  let skillsArr: string[] = [];
  if (row.skills_required) {
    try {
      skillsArr = JSON.parse(row.skills_required) as string[];
    } catch {
      skillsArr = [];
    }
  }
  return {
    id: row.id,
    external_id: row.external_id ?? "",
    company_id: row.company_id ?? "",
    company_name: companyName ?? "",
    title: row.title,
    description: row.description,
    location: row.location ?? "",
    is_dr_friendly: row.is_dr_friendly ?? false,
    dr_filter_reason: row.dr_filter_reason ?? "",
    dr_eligibility: (row.dr_eligibility ?? null) as Job["dr_eligibility"],
    source: row.source as Job["source"],
    source_url: row.source_url ?? "",
    apply_url: row.apply_url ?? "",
    salary_min: row.salary_min ?? null,
    salary_max: row.salary_max ?? null,
    salary_currency: row.salary_currency ?? "USD",
    employment_type: (row.employment_type ?? "full_time") as Job["employment_type"],
    seniority_level: (row.seniority_level ?? "mid") as Job["seniority_level"],
    skills_required: skillsArr,
    posted_at: row.posted_at ?? 0,
    expires_at: row.expires_at ?? null,
    scraped_at: row.scraped_at,
    created_at: row.created_at,
    needs_recovery: row.needs_recovery ?? false,
    raw_payload: row.raw_payload ?? null,
  };
}

// --------------------------------------------------------------------------
// Company helpers
// --------------------------------------------------------------------------

export async function getAllCompanies(): Promise<Company[]> {
  const rows = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  return rows.map(mapCompany);
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  return rows.length > 0 ? mapCompany(rows[0]) : null;
}

export async function upsertCompany(company: Omit<Company, "created_at" | "updated_at">): Promise<void> {
  const now = Date.now();
  await db
    .insert(schema.companies)
    .values({
      id: company.id,
      name: company.name,
      website: company.website,
      careers_url: company.careers_url,
      logo_url: company.logo_url,
      scraper_id: company.scraper_id,
      is_nearshore: company.is_nearshore,
      headquarters_country: company.headquarters_country,
      glassdoor_url: company.glassdoor_url,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.companies.id,
      set: {
        name: company.name,
        website: company.website,
        careers_url: company.careers_url,
        logo_url: company.logo_url,
        scraper_id: company.scraper_id,
        is_nearshore: company.is_nearshore,
        headquarters_country: company.headquarters_country,
        glassdoor_url: company.glassdoor_url,
        updated_at: now,
      },
    });
}

/**
 * Case-insensitive lookup by company name, creating the row when absent.
 * Used by ingestion so re-scrapes reuse the same company instead of creating
 * a duplicate per job.
 */
export async function findOrCreateCompanyByName(
  name: string,
  website: string | undefined,
  scraperId: string,
): Promise<string> {
  const display = name.trim() || "Unknown Company";
  const existing = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(sql`lower(${schema.companies.name}) = ${display.toLowerCase()}`)
    .limit(1);
  if (existing.length > 0) {
    return existing[0].id;
  }

  const id = ulid();
  const now = Date.now();
  await db.insert(schema.companies).values({
    id,
    name: display,
    website: website ?? null,
    scraper_id: scraperId,
    created_at: now,
    updated_at: now,
  });
  return id;
}

function mapCompany(row: typeof schema.companies.$inferSelect): Company {
  return {
    id: row.id,
    name: row.name,
    website: row.website ?? "",
    careers_url: row.careers_url ?? "",
    logo_url: row.logo_url ?? "",
    scraper_id: row.scraper_id ?? "",
    is_nearshore: row.is_nearshore ?? true,
    headquarters_country: row.headquarters_country ?? "",
    glassdoor_url: row.glassdoor_url ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// CV helpers
// --------------------------------------------------------------------------

export async function getAllCvs(): Promise<CvRecord[]> {
  const rows = await db.select().from(schema.cvs).orderBy(desc(schema.cvs.created_at));
  return rows.map(mapCv);
}

export async function getCvById(id: string): Promise<CvRecord | null> {
  const rows = await db.select().from(schema.cvs).where(eq(schema.cvs.id, id)).limit(1);
  return rows.length > 0 ? mapCv(rows[0]) : null;
}

export async function insertCv(cv: NewCvRecord): Promise<void> {
  const now = Date.now();
  await db.insert(schema.cvs).values({
    id: cv.id,
    name: cv.name,
    file_path: cv.file_path,
    file_type: cv.file_type,
    raw_text: cv.raw_text,
    parsed_data: JSON.stringify(cv.parsed_data),
    layout_lines: cv.layout_lines ? JSON.stringify(cv.layout_lines) : null,
    is_primary: cv.is_primary,
    source: cv.source ?? "upload",
    parent_cv_id: cv.parent_cv_id ?? null,
    target_job_id: cv.target_job_id ?? null,
    target_job_title: cv.target_job_title ?? null,
    target_company: cv.target_company ?? null,
    generated_cv_id: cv.generated_cv_id ?? null,
    created_at: now,
    updated_at: now,
  });
}

/** Updates a tailored CV's content (and optionally its name/target) in place. */
export async function updateTailoredCv(
  id: string,
  patch: {
    name?: string;
    raw_text: string;
    parsed_data: ParsedCv;
    generated_cv_id?: string | null;
    target_job_id?: string | null;
    target_job_title?: string | null;
    target_company?: string | null;
  },
): Promise<void> {
  const set: Partial<typeof schema.cvs.$inferInsert> = {
    raw_text: patch.raw_text,
    parsed_data: JSON.stringify(patch.parsed_data),
    updated_at: Date.now(),
  };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.generated_cv_id !== undefined) set.generated_cv_id = patch.generated_cv_id;
  if (patch.target_job_id !== undefined) set.target_job_id = patch.target_job_id;
  if (patch.target_job_title !== undefined) set.target_job_title = patch.target_job_title;
  if (patch.target_company !== undefined) set.target_company = patch.target_company;
  await db.update(schema.cvs).set(set).where(eq(schema.cvs.id, id));
}

export async function updateCvName(id: string, name: string): Promise<void> {
  await db
    .update(schema.cvs)
    .set({ name, updated_at: Date.now() })
    .where(eq(schema.cvs.id, id));
}

/** Tailored CVs generated from a given source CV, most recently updated first. */
export async function getTailoredCvsByParent(parentCvId: string): Promise<CvRecord[]> {
  const rows = await db
    .select()
    .from(schema.cvs)
    .where(and(eq(schema.cvs.parent_cv_id, parentCvId), eq(schema.cvs.source, "tailored")))
    .orderBy(desc(schema.cvs.updated_at));
  return rows.map(mapCv);
}

/** `layoutLines` is only written when given, so edits keep the upload's layout. */
export async function updateCvParsedData(
  id: string,
  rawText: string,
  parsedData: import("@/types").ParsedCv,
  layoutLines?: CvLayoutLine[] | null,
): Promise<void> {
  const set: Partial<typeof schema.cvs.$inferInsert> = {
    raw_text: rawText,
    parsed_data: JSON.stringify(parsedData),
    updated_at: Date.now(),
  };
  if (layoutLines !== undefined) set.layout_lines = layoutLines ? JSON.stringify(layoutLines) : null;
  await db.update(schema.cvs).set(set).where(eq(schema.cvs.id, id));
}

function parseLayoutLines(json: string | null): CvLayoutLine[] | null {
  if (!json) return null;
  try {
    const lines = JSON.parse(json) as unknown;
    return Array.isArray(lines) && lines.length > 0 ? (lines as CvLayoutLine[]) : null;
  } catch {
    return null;
  }
}

export async function setCvPrimary(id: string): Promise<void> {
  // The primary flag is metadata, not content: leave updated_at alone so "recently
  // edited" ordering isn't disturbed for every CV.
  await db.update(schema.cvs).set({ is_primary: false }).where(eq(schema.cvs.is_primary, true));
  await db.update(schema.cvs).set({ is_primary: true }).where(eq(schema.cvs.id, id));
}

/** Thrown when a CV can't be deleted because other records (applications, cover letters…) still use it. */
export class CvInUseError extends Error {
  constructor(cause: unknown) {
    super("This CV is still used by applications, cover letters or reports.");
    this.name = "CvInUseError";
    this.cause = cause;
  }
}

/** Records (other than generated-CV history) whose FK to cvs blocks deleting this CV. */
async function countCvBlockingReferences(id: string): Promise<number> {
  const counts = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.applications).where(eq(schema.applications.cv_id, id)),
    db.select({ n: sql<number>`count(*)` }).from(schema.atsReports).where(eq(schema.atsReports.cv_id, id)),
    db.select({ n: sql<number>`count(*)` }).from(schema.starStories).where(eq(schema.starStories.cv_id, id)),
    db.select({ n: sql<number>`count(*)` }).from(schema.coverLetters).where(eq(schema.coverLetters.cv_id, id)),
  ]);
  return counts.reduce((sum, rows) => sum + Number(rows[0]?.n ?? 0), 0);
}

export async function deleteCv(id: string): Promise<void> {
  // Foreign keys are enforced and statements aren't transactional, so check for blocking
  // references BEFORE touching anything — a failed delete must not lose history.
  if ((await countCvBlockingReferences(id)) > 0) {
    throw new CvInUseError(null);
  }
  // Only generated-CV history remains: detach and delete it, then the CV.
  // Tailored CVs derived from this one keep a dangling parent_cv_id (no FK) — by design.
  await db.run(
    sql`UPDATE applications SET generated_cv_id = NULL WHERE generated_cv_id IN (SELECT id FROM generated_cvs WHERE cv_id = ${id})`,
  );
  await db.delete(schema.generatedCvs).where(eq(schema.generatedCvs.cv_id, id));
  try {
    await db.delete(schema.cvs).where(eq(schema.cvs.id, id));
  } catch (err) {
    if (/foreign key/i.test(String(err))) throw new CvInUseError(err);
    throw err;
  }
}

function mapCv(row: typeof schema.cvs.$inferSelect): CvRecord {
  let parsedData: import("@/types").ParsedCv = {
    full_name: "", email: "", phone: "", location: "",
    linkedin_url: "", github_url: "", portfolio_url: "", summary: "",
    skills: { technical: [], soft: [] },
    experience: [], education: [], certifications: [], projects: [], languages: [],
  };
  if (row.parsed_data) {
    try {
      parsedData = JSON.parse(row.parsed_data) as import("@/types").ParsedCv;
    } catch { /* keep default */ }
  }
  return {
    id: row.id,
    name: row.name,
    file_path: row.file_path,
    file_type: row.file_type as CvRecord["file_type"],
    raw_text: row.raw_text ?? "",
    parsed_data: parsedData,
    layout_lines: parseLayoutLines(row.layout_lines),
    is_primary: row.is_primary ?? false,
    source: row.source === "tailored" ? "tailored" : "upload",
    parent_cv_id: row.parent_cv_id ?? null,
    target_job_id: row.target_job_id ?? null,
    target_job_title: row.target_job_title ?? null,
    target_company: row.target_company ?? null,
    generated_cv_id: row.generated_cv_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Application helpers
// --------------------------------------------------------------------------

export async function getAllApplications(): Promise<Application[]> {
  const rows = await db.select().from(schema.applications).orderBy(desc(schema.applications.created_at));
  return rows.map(mapApplication);
}

export async function getApplicationById(id: string): Promise<Application | null> {
  const rows = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
  return rows.length > 0 ? mapApplication(rows[0]) : null;
}

export async function insertApplication(app: Omit<Application, "created_at" | "updated_at">): Promise<void> {
  const now = Date.now();
  await db.insert(schema.applications).values({
    id: app.id,
    job_id: app.job_id,
    cv_id: app.cv_id,
    generated_cv_id: app.generated_cv_id,
    status: app.status,
    applied_at: app.applied_at,
    notes: app.notes,
    last_contact_at: app.last_contact_at,
    snoozed_until: app.snoozed_until,
    closed_reason: app.closed_reason,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Sets the status. Moving to "applied" stamps applied_at the first time only, so
 * dragging a card back and forth never resets the follow-up clock.
 */
export async function updateApplicationStatus(id: string, status: string): Promise<void> {
  const now = Date.now();
  await db
    .update(schema.applications)
    .set({
      status,
      updated_at: now,
      ...(status === "applied" ? { applied_at: sql`COALESCE(${schema.applications.applied_at}, ${now})` } : {}),
    })
    .where(eq(schema.applications.id, id));
}

export async function updateApplicationFields(
  id: string,
  data: Partial<Pick<Application, "applied_at" | "last_contact_at" | "snoozed_until" | "closed_reason">>,
): Promise<void> {
  const updateSet: Record<string, unknown> = { updated_at: Date.now() };
  if (data.applied_at !== undefined) updateSet.applied_at = data.applied_at;
  if (data.last_contact_at !== undefined) updateSet.last_contact_at = data.last_contact_at;
  if (data.snoozed_until !== undefined) updateSet.snoozed_until = data.snoozed_until;
  if (data.closed_reason !== undefined) updateSet.closed_reason = data.closed_reason;
  await db.update(schema.applications).set(updateSet).where(eq(schema.applications.id, id));
}

export async function updateApplicationNotes(id: string, notes: string): Promise<void> {
  const now = Date.now();
  await db
    .update(schema.applications)
    .set({ notes, updated_at: now })
    .where(eq(schema.applications.id, id));
}

export async function deleteApplication(id: string): Promise<void> {
  // Children first: sqlx enables foreign_keys, so a parent delete would be rejected.
  await db.delete(schema.applicationEvents).where(eq(schema.applicationEvents.application_id, id));
  await db.delete(schema.interviews).where(eq(schema.interviews.application_id, id));
  await db.delete(schema.interviewPreps).where(eq(schema.interviewPreps.application_id, id));
  await db.delete(schema.prepDocuments).where(eq(schema.prepDocuments.application_id, id));
  await db.delete(schema.mockSessions).where(eq(schema.mockSessions.application_id, id));
  await db.delete(schema.applications).where(eq(schema.applications.id, id));
}

function mapApplication(row: typeof schema.applications.$inferSelect): Application {
  return {
    id: row.id,
    job_id: row.job_id,
    cv_id: row.cv_id,
    generated_cv_id: row.generated_cv_id ?? null,
    status: row.status as Application["status"],
    applied_at: row.applied_at ?? null,
    notes: row.notes ?? "",
    last_contact_at: row.last_contact_at ?? null,
    snoozed_until: row.snoozed_until ?? null,
    closed_reason: (row.closed_reason ?? null) as Application["closed_reason"],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Application event helpers
// --------------------------------------------------------------------------

export async function getApplicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
  const rows = await db
    .select()
    .from(schema.applicationEvents)
    .where(eq(schema.applicationEvents.application_id, applicationId))
    .orderBy(asc(schema.applicationEvents.created_at));
  return rows.map(mapApplicationEvent);
}

export async function getAllApplicationEvents(): Promise<ApplicationEvent[]> {
  const rows = await db
    .select()
    .from(schema.applicationEvents)
    .orderBy(asc(schema.applicationEvents.created_at));
  return rows.map(mapApplicationEvent);
}

export async function insertApplicationEvent(event: ApplicationEvent): Promise<void> {
  await db.insert(schema.applicationEvents).values({
    id: event.id,
    application_id: event.application_id,
    type: event.type,
    from_status: event.from_status,
    to_status: event.to_status,
    payload: JSON.stringify(event.payload),
    created_at: event.created_at,
  });
}

function mapApplicationEvent(row: typeof schema.applicationEvents.$inferSelect): ApplicationEvent {
  return {
    id: row.id,
    application_id: row.application_id,
    type: row.type as ApplicationEvent["type"],
    from_status: (row.from_status ?? null) as ApplicationEvent["from_status"],
    to_status: (row.to_status ?? null) as ApplicationEvent["to_status"],
    payload: safeJsonParse<ApplicationEvent["payload"]>(row.payload, {}),
    created_at: row.created_at,
  };
}

// --------------------------------------------------------------------------
// Interview helpers
// --------------------------------------------------------------------------

export async function getAllInterviews(): Promise<Interview[]> {
  const rows = await db.select().from(schema.interviews).orderBy(asc(schema.interviews.scheduled_at));
  return rows.map(mapInterview);
}

export async function getInterviewsByApplicationId(applicationId: string): Promise<Interview[]> {
  const rows = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.application_id, applicationId))
    .orderBy(asc(schema.interviews.scheduled_at));
  return rows.map(mapInterview);
}

export async function getInterviewById(id: string): Promise<Interview | null> {
  const rows = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  return rows.length > 0 ? mapInterview(rows[0]) : null;
}

export async function insertInterview(interview: Omit<Interview, "created_at" | "updated_at">): Promise<void> {
  const now = Date.now();
  await db.insert(schema.interviews).values({
    id: interview.id,
    application_id: interview.application_id,
    scheduled_at: interview.scheduled_at,
    duration_minutes: interview.duration_minutes,
    interview_type: interview.interview_type,
    location: interview.location,
    meeting_url: interview.meeting_url,
    interviewer_name: interview.interviewer_name,
    interviewer_role: interview.interviewer_role,
    interviewer_timezone: interview.interviewer_timezone,
    notes: interview.notes,
    feedback: interview.feedback,
    outcome: interview.outcome,
    status: interview.status,
    created_at: now,
    updated_at: now,
  });
}

export async function updateInterview(id: string, data: Partial<Interview>): Promise<void> {
  const now = Date.now();
  const updateSet: Record<string, unknown> = { updated_at: now };
  if (data.scheduled_at !== undefined) updateSet.scheduled_at = data.scheduled_at;
  if (data.duration_minutes !== undefined) updateSet.duration_minutes = data.duration_minutes;
  if (data.interview_type !== undefined) updateSet.interview_type = data.interview_type;
  if (data.location !== undefined) updateSet.location = data.location;
  if (data.meeting_url !== undefined) updateSet.meeting_url = data.meeting_url;
  if (data.interviewer_name !== undefined) updateSet.interviewer_name = data.interviewer_name;
  if (data.interviewer_role !== undefined) updateSet.interviewer_role = data.interviewer_role;
  if (data.interviewer_timezone !== undefined) updateSet.interviewer_timezone = data.interviewer_timezone;
  if (data.notes !== undefined) updateSet.notes = data.notes;
  if (data.feedback !== undefined) updateSet.feedback = data.feedback;
  if (data.outcome !== undefined) updateSet.outcome = data.outcome;
  if (data.status !== undefined) updateSet.status = data.status;

  await db.update(schema.interviews).set(updateSet).where(eq(schema.interviews.id, id));
}

export async function deleteInterview(id: string): Promise<void> {
  await db.delete(schema.prepDocuments).where(eq(schema.prepDocuments.interview_id, id));
  await db.delete(schema.interviews).where(eq(schema.interviews.id, id));
}

// --------------------------------------------------------------------------
// Prep document helpers (gap brief, round packs)
// --------------------------------------------------------------------------

export async function getPrepDocument<T>(
  applicationId: string,
  kind: PrepDocumentKind,
  interviewId = "",
): Promise<PrepDocument<T> | null> {
  const rows = await db
    .select()
    .from(schema.prepDocuments)
    .where(
      and(
        eq(schema.prepDocuments.application_id, applicationId),
        eq(schema.prepDocuments.interview_id, interviewId),
        eq(schema.prepDocuments.kind, kind),
      ),
    )
    .limit(1);
  return rows.length > 0 ? mapPrepDocument<T>(rows[0]) : null;
}

export async function upsertPrepDocument<T>(
  doc: Omit<PrepDocument<T>, "id" | "created_at" | "updated_at">,
): Promise<PrepDocument<T>> {
  const now = Date.now();
  const id = ulid();
  const content = JSON.stringify(doc.content);
  await db
    .insert(schema.prepDocuments)
    .values({
      id,
      application_id: doc.application_id,
      interview_id: doc.interview_id,
      kind: doc.kind,
      language: doc.language,
      content,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.prepDocuments.application_id, schema.prepDocuments.interview_id, schema.prepDocuments.kind],
      set: { language: doc.language, content, updated_at: now },
    });
  emitPrepDocumentChanged({ applicationId: doc.application_id, kind: doc.kind, interviewId: doc.interview_id });
  return (await getPrepDocument<T>(doc.application_id, doc.kind, doc.interview_id))!;
}

function mapPrepDocument<T>(row: typeof schema.prepDocuments.$inferSelect): PrepDocument<T> {
  return {
    id: row.id,
    application_id: row.application_id,
    interview_id: row.interview_id,
    kind: row.kind as PrepDocumentKind,
    language: row.language === "es" ? "es" : "en",
    content: safeJsonParse<T>(row.content, null as T),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Mock interview helpers
// --------------------------------------------------------------------------

export async function getMockSessionsByApplicationId(applicationId: string): Promise<MockSession[]> {
  const rows = await db
    .select()
    .from(schema.mockSessions)
    .where(eq(schema.mockSessions.application_id, applicationId))
    .orderBy(desc(schema.mockSessions.created_at));
  return rows.map(mapMockSession);
}

export async function getMockSessionById(id: string): Promise<MockSession | null> {
  const rows = await db.select().from(schema.mockSessions).where(eq(schema.mockSessions.id, id)).limit(1);
  return rows.length > 0 ? mapMockSession(rows[0]) : null;
}

export async function saveMockSession(session: MockSession): Promise<void> {
  const values = {
    id: session.id,
    application_id: session.application_id,
    interview_id: session.interview_id,
    interview_type: session.interview_type,
    language: session.language,
    coaching_language: session.coaching_language,
    total_questions: session.total_questions,
    turns: JSON.stringify(session.turns),
    report: session.report ? JSON.stringify(session.report) : null,
    status: session.status,
    created_at: session.created_at,
    updated_at: Date.now(),
  };
  await db
    .insert(schema.mockSessions)
    .values(values)
    .onConflictDoUpdate({
      target: schema.mockSessions.id,
      set: { turns: values.turns, report: values.report, status: values.status, updated_at: values.updated_at },
    });
}

export async function deleteMockSession(id: string): Promise<void> {
  await db.delete(schema.mockSessions).where(eq(schema.mockSessions.id, id));
}

function mapMockSession(row: typeof schema.mockSessions.$inferSelect): MockSession {
  return {
    id: row.id,
    application_id: row.application_id,
    interview_id: row.interview_id,
    interview_type: row.interview_type as MockSession["interview_type"],
    language: row.language === "es" ? "es" : "en",
    coaching_language: row.coaching_language === "es" ? "es" : "en",
    total_questions: row.total_questions,
    turns: safeJsonParse<MockSession["turns"]>(row.turns, []),
    report: safeJsonParse<MockSession["report"]>(row.report, null),
    status: row.status === "completed" ? "completed" : "active",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapInterview(row: typeof schema.interviews.$inferSelect): Interview {
  return {
    id: row.id,
    application_id: row.application_id,
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes ?? 60,
    interview_type: row.interview_type as Interview["interview_type"],
    location: row.location ?? "",
    meeting_url: row.meeting_url ?? "",
    interviewer_name: row.interviewer_name ?? "",
    interviewer_role: row.interviewer_role ?? "",
    interviewer_timezone: row.interviewer_timezone ?? "",
    notes: row.notes ?? "",
    feedback: row.feedback ?? "",
    outcome: (row.outcome ?? "pending") as Interview["outcome"],
    status: row.status as Interview["status"],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// ATS Report helpers
// --------------------------------------------------------------------------

export async function getAtsReportsByCvId(cvId: string): Promise<AtsReport[]> {
  const rows = await db
    .select()
    .from(schema.atsReports)
    .where(eq(schema.atsReports.cv_id, cvId))
    .orderBy(desc(schema.atsReports.created_at));
  return rows.map(mapAtsReport);
}

export async function insertAtsReport(report: AtsReport): Promise<void> {
  await db.insert(schema.atsReports).values({
    id: report.id,
    cv_id: report.cv_id,
    job_id: report.job_id,
    ats_score: report.ats_score,
    keyword_score: report.keyword_score,
    format_score: report.format_score,
    structure_score: report.structure_score,
    contact_score: report.contact_score,
    consistency_score: report.consistency_score,
    spelling_score: report.spelling_score,
    length_score: report.length_score,
    keyword_matches: JSON.stringify(report.keyword_matches),
    issues: JSON.stringify(report.issues),
    checks: JSON.stringify(report.checks),
    narrative_report: report.narrative_report,
    narrative_scores: report.narrative_scores ? JSON.stringify(report.narrative_scores) : null,
    created_at: report.created_at,
  });
}

function mapAtsReport(row: typeof schema.atsReports.$inferSelect): AtsReport {
  return {
    id: row.id,
    cv_id: row.cv_id,
    job_id: row.job_id ?? null,
    ats_score: row.ats_score,
    keyword_score: row.keyword_score ?? 0,
    format_score: row.format_score ?? 0,
    structure_score: row.structure_score ?? 0,
    contact_score: row.contact_score ?? 0,
    consistency_score: row.consistency_score ?? 0,
    spelling_score: row.spelling_score ?? 0,
    length_score: row.length_score ?? 0,
    keyword_matches: safeJsonParse(row.keyword_matches, { matched: [], missing: [], partial: [] }),
    issues: safeJsonParse(row.issues, []),
    checks: safeJsonParse(row.checks, []),
    narrative_report: row.narrative_report ?? "",
    narrative_scores: safeJsonParse(row.narrative_scores, null),
    created_at: row.created_at,
  };
}

// --------------------------------------------------------------------------
// Generated CV helpers
// --------------------------------------------------------------------------

export async function getGeneratedCvsByCvId(cvId: string): Promise<GeneratedCv[]> {
  const rows = await db
    .select()
    .from(schema.generatedCvs)
    .where(eq(schema.generatedCvs.cv_id, cvId))
    .orderBy(desc(schema.generatedCvs.created_at));
  return rows.map(mapGeneratedCv);
}

/** Insert or update (same id) a generated-CV history row. Saving twice never duplicates. */
export async function upsertGeneratedCv(cv: GeneratedCv): Promise<void> {
  await db
    .insert(schema.generatedCvs)
    .values({
      id: cv.id,
      cv_id: cv.cv_id,
      job_id: cv.job_id,
      content: cv.content,
      match_score_before: cv.match_score_before,
      match_score_after: cv.match_score_after,
      llm_provider: cv.llm_provider,
      llm_model: cv.llm_model,
      created_at: cv.created_at,
    })
    .onConflictDoUpdate({
      target: schema.generatedCvs.id,
      set: {
        content: cv.content,
        match_score_before: cv.match_score_before,
        match_score_after: cv.match_score_after,
        llm_provider: cv.llm_provider,
        llm_model: cv.llm_model,
      },
    });
}

export interface GeneratedCvWithJob extends GeneratedCv {
  job_title: string | null;
  company_name: string | null;
}

/** Generation history for a source CV, with the target job's title/company (null if the job was wiped). */
export async function getGeneratedCvsWithJobByCvId(cvId: string): Promise<GeneratedCvWithJob[]> {
  const rows = await db
    .select()
    .from(schema.generatedCvs)
    .leftJoin(schema.jobs, eq(schema.generatedCvs.job_id, schema.jobs.id))
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.generatedCvs.cv_id, cvId))
    .orderBy(desc(schema.generatedCvs.created_at));
  return rows.map((r) => ({
    ...mapGeneratedCv(r.generated_cvs),
    job_title: r.jobs?.title ?? null,
    company_name: r.companies?.name ?? null,
  }));
}

function mapGeneratedCv(row: typeof schema.generatedCvs.$inferSelect): GeneratedCv {
  return {
    id: row.id,
    cv_id: row.cv_id,
    job_id: row.job_id,
    content: row.content,
    match_score_before: row.match_score_before ?? null,
    match_score_after: row.match_score_after ?? null,
    llm_provider: row.llm_provider ?? "",
    llm_model: row.llm_model ?? "",
    created_at: row.created_at,
  };
}

// --------------------------------------------------------------------------
// Star Story helpers
// --------------------------------------------------------------------------

export async function getStarStoriesByCvId(cvId: string): Promise<StarStory[]> {
  const rows = await db
    .select()
    .from(schema.starStories)
    .where(eq(schema.starStories.cv_id, cvId))
    .orderBy(asc(schema.starStories.experience_index));
  return rows.map(mapStarStory);
}

export async function insertStarStory(story: StarStory): Promise<void> {
  await db.insert(schema.starStories).values({
    id: story.id,
    cv_id: story.cv_id,
    experience_index: story.experience_index,
    title: story.title,
    situation: story.situation,
    task: story.task,
    action: story.action,
    result: story.result,
    skills_demonstrated: JSON.stringify(story.skills_demonstrated),
    is_user_edited: story.is_user_edited,
    created_at: story.created_at,
    updated_at: story.updated_at,
  });
}

export async function updateStarStory(story: StarStory): Promise<void> {
  await db.update(schema.starStories).set({
    title: story.title,
    situation: story.situation,
    task: story.task,
    action: story.action,
    result: story.result,
    skills_demonstrated: JSON.stringify(story.skills_demonstrated),
    is_user_edited: story.is_user_edited,
    updated_at: story.updated_at,
  }).where(eq(schema.starStories.id, story.id));
}

export async function deleteStarStory(id: string): Promise<void> {
  await db.delete(schema.starStories).where(eq(schema.starStories.id, id));
}

function mapStarStory(row: typeof schema.starStories.$inferSelect): StarStory {
  return {
    id: row.id,
    cv_id: row.cv_id,
    experience_index: row.experience_index,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    skills_demonstrated: safeJsonParse(row.skills_demonstrated, []),
    is_user_edited: row.is_user_edited ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Interview Prep helpers
// --------------------------------------------------------------------------

export async function getInterviewPrepByApplicationId(applicationId: string): Promise<InterviewPrep | null> {
  const rows = await db
    .select()
    .from(schema.interviewPreps)
    .where(eq(schema.interviewPreps.application_id, applicationId))
    .limit(1);
  if (rows.length === 0) return null;
  return mapInterviewPrep(rows[0]);
}

export async function upsertInterviewPrep(prep: InterviewPrep): Promise<void> {
  const now = Date.now();
  await db
    .insert(schema.interviewPreps)
    .values({
      id: prep.id,
      application_id: prep.application_id,
      pitch_casual: prep.pitch_casual,
      pitch_formal: prep.pitch_formal,
      pitch_technical: prep.pitch_technical,
      strengths: JSON.stringify(prep.strengths),
      weaknesses: JSON.stringify(prep.weaknesses),
      company_brief: prep.company_brief,
      custom_questions: JSON.stringify(prep.custom_questions),
      checklist_state: JSON.stringify(prep.checklist_state),
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.interviewPreps.id,
      set: {
        pitch_casual: prep.pitch_casual,
        pitch_formal: prep.pitch_formal,
        pitch_technical: prep.pitch_technical,
        strengths: JSON.stringify(prep.strengths),
        weaknesses: JSON.stringify(prep.weaknesses),
        company_brief: prep.company_brief,
        custom_questions: JSON.stringify(prep.custom_questions),
        checklist_state: JSON.stringify(prep.checklist_state),
        updated_at: now,
      },
    });
}

function mapInterviewPrep(row: typeof schema.interviewPreps.$inferSelect): InterviewPrep {
  return {
    id: row.id,
    application_id: row.application_id,
    pitch_casual: row.pitch_casual ?? "",
    pitch_formal: row.pitch_formal ?? "",
    pitch_technical: row.pitch_technical ?? "",
    strengths: safeJsonParse(row.strengths, []),
    weaknesses: safeJsonParse(row.weaknesses, []),
    company_brief: row.company_brief ?? "",
    custom_questions: safeJsonParse(row.custom_questions, []),
    checklist_state: safeJsonParse(row.checklist_state, {
      pre_interview: {},
      video_call_setup: {},
      during_interview: {},
      closing: {},
      post_interview: {},
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Scrape Run helpers
// --------------------------------------------------------------------------

export async function getAllScrapeRuns(): Promise<ScrapeRun[]> {
  const rows = await db.select().from(schema.scrapeRuns).orderBy(desc(schema.scrapeRuns.started_at));
  return rows.map(mapScrapeRun);
}

export async function getScrapeRunsByScraperId(scraperId: string): Promise<ScrapeRun[]> {
  const rows = await db
    .select()
    .from(schema.scrapeRuns)
    .where(eq(schema.scrapeRuns.scraper_id, scraperId))
    .orderBy(desc(schema.scrapeRuns.started_at));
  return rows.map(mapScrapeRun);
}

export async function insertScrapeRun(run: Omit<ScrapeRun, "completed_at">): Promise<void> {
  await db.insert(schema.scrapeRuns).values({
    id: run.id,
    scraper_id: run.scraper_id,
    status: run.status,
    jobs_found: run.jobs_found,
    jobs_new: run.jobs_new,
    searches_used: run.searches_used,
    error_message: run.error_message,
    started_at: run.started_at,
    completed_at: null,
  });
}

export async function updateScrapeRun(
  id: string,
  data: Partial<Pick<ScrapeRun, "status" | "jobs_found" | "jobs_new" | "searches_used" | "error_message" | "completed_at">>,
): Promise<void> {
  await db.update(schema.scrapeRuns).set(data).where(eq(schema.scrapeRuns.id, id));
}

function mapScrapeRun(row: typeof schema.scrapeRuns.$inferSelect): ScrapeRun {
  return {
    id: row.id,
    scraper_id: row.scraper_id,
    status: row.status as ScrapeRun["status"],
    jobs_found: row.jobs_found ?? 0,
    jobs_new: row.jobs_new ?? 0,
    searches_used: row.searches_used ?? 0,
    error_message: row.error_message ?? "",
    started_at: row.started_at,
    completed_at: row.completed_at ?? null,
  };
}

// --------------------------------------------------------------------------
// Settings helpers
// --------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const now = Date.now();
  await db
    .insert(schema.settings)
    .values({ key, value, updated_at: now })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updated_at: now },
    });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.settings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// --------------------------------------------------------------------------
// Company blacklist
//
// Display-time filter only: blacklisted companies' jobs are hidden from the
// list, facets, recommendations and report, but never dropped from the DB —
// removing a company from the blacklist makes its jobs reappear. Stored as a
// JSON array of names (the ingest de-dupes companies by lower(name), so one
// name maps to one company row) under a single settings key.
// --------------------------------------------------------------------------

const COMPANY_BLACKLIST_KEY = "company_blacklist";

/** Blacklisted company names, as the user typed them. */
export async function getCompanyBlacklist(): Promise<string[]> {
  const raw = await getSetting(COMPANY_BLACKLIST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

/** Persist the blacklist: trim, drop blanks, de-dupe case-insensitively (first casing wins). */
export async function setCompanyBlacklist(names: string[]): Promise<void> {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  await setSetting(COMPANY_BLACKLIST_KEY, JSON.stringify(cleaned));
}

/**
 * Resolve the blacklisted names to company IDs (case-insensitive), for excluding
 * jobs by `company_id`. Resolving to IDs — rather than filtering on a joined
 * `companies.name` — avoids the `NULL NOT IN (...)` pitfall for jobs whose
 * company row is missing.
 */
export async function getBlacklistedCompanyIds(): Promise<string[]> {
  const names = await getCompanyBlacklist();
  const lowered = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return [];
  const rows = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(inArray(sql`lower(${schema.companies.name})`, lowered));
  return rows.map((r) => r.id);
}

// --------------------------------------------------------------------------
// Cover Letter helpers
// --------------------------------------------------------------------------

export async function getCoverLettersByJob(cvId: string, jobId: string): Promise<CoverLetter[]> {
  const rows = await db
    .select()
    .from(schema.coverLetters)
    .where(and(eq(schema.coverLetters.cv_id, cvId), eq(schema.coverLetters.job_id, jobId)))
    .orderBy(desc(schema.coverLetters.created_at));
  return rows.map(mapCoverLetter);
}

export async function getAllCoverLetters(): Promise<CoverLetter[]> {
  const rows = await db
    .select()
    .from(schema.coverLetters)
    .orderBy(desc(schema.coverLetters.created_at));
  return rows.map(mapCoverLetter);
}

export async function insertCoverLetter(letter: CoverLetter): Promise<void> {
  await db.insert(schema.coverLetters).values({
    id: letter.id,
    cv_id: letter.cv_id,
    job_id: letter.job_id,
    content: letter.content,
    tone: letter.tone,
    llm_provider: letter.llm_provider,
    llm_model: letter.llm_model,
    created_at: letter.created_at,
    updated_at: letter.updated_at,
  });
}

function mapCoverLetter(row: typeof schema.coverLetters.$inferSelect): CoverLetter {
  return {
    id: row.id,
    cv_id: row.cv_id,
    job_id: row.job_id,
    content: row.content,
    tone: row.tone ?? "professional",
    llm_provider: row.llm_provider ?? "",
    llm_model: row.llm_model ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Match Analysis helpers
// --------------------------------------------------------------------------

export async function getMatchAnalysis(
  cvId: string,
  jobId: string,
): Promise<MatchAnalysisRecord | null> {
  const rows = await db
    .select()
    .from(schema.matchAnalyses)
    .where(
      and(
        eq(schema.matchAnalyses.cv_id, cvId),
        eq(schema.matchAnalyses.job_id, jobId),
      ),
    )
    .limit(1);
  return rows.length > 0 ? mapMatchAnalysis(rows[0]) : null;
}

export async function upsertMatchAnalysis(
  record: MatchAnalysisRecord,
): Promise<void> {
  await db
    .insert(schema.matchAnalyses)
    .values({
      id: record.id,
      cv_id: record.cv_id,
      job_id: record.job_id,
      analysis: JSON.stringify(record.analysis),
      llm_provider: record.llm_provider,
      llm_model: record.llm_model,
      cv_fingerprint: record.cv_fingerprint ?? null,
      job_fingerprint: record.job_fingerprint ?? null,
      created_at: record.created_at,
    })
    .onConflictDoUpdate({
      target: [schema.matchAnalyses.cv_id, schema.matchAnalyses.job_id],
      set: {
        analysis: JSON.stringify(record.analysis),
        llm_provider: record.llm_provider,
        llm_model: record.llm_model,
        cv_fingerprint: record.cv_fingerprint ?? null,
        job_fingerprint: record.job_fingerprint ?? null,
        created_at: record.created_at,
      },
    });
}

export async function deleteMatchAnalysis(
  cvId: string,
  jobId: string,
): Promise<void> {
  await db
    .delete(schema.matchAnalyses)
    .where(
      and(
        eq(schema.matchAnalyses.cv_id, cvId),
        eq(schema.matchAnalyses.job_id, jobId),
      ),
    );
}

function mapMatchAnalysis(
  row: typeof schema.matchAnalyses.$inferSelect,
): MatchAnalysisRecord {
  return {
    id: row.id,
    cv_id: row.cv_id,
    job_id: row.job_id,
    analysis: safeJsonParse<MatchAnalysis>(row.analysis, {
      overall_match: 0,
      skills_match: [],
      experience_match: 0,
      seniority_fit: "good_fit",
      gaps: [],
      strengths: [],
      recommendation: "",
    }),
    llm_provider: row.llm_provider ?? "",
    llm_model: row.llm_model ?? "",
    cv_fingerprint: row.cv_fingerprint ?? null,
    job_fingerprint: row.job_fingerprint ?? null,
    created_at: row.created_at,
  };
}

// --------------------------------------------------------------------------
// Glassdoor Interview Reviews
// --------------------------------------------------------------------------

export async function getGlassdoorInterviewReviewsByCompanyId(
  companyId: string,
): Promise<GlassdoorInterviewReview[]> {
  const rows = await db
    .select()
    .from(schema.glassdoorInterviewReviews)
    .where(eq(schema.glassdoorInterviewReviews.company_id, companyId))
    .orderBy(desc(schema.glassdoorInterviewReviews.created_at));
  return rows.map(mapGlassdoorInterviewReview);
}

export async function insertGlassdoorInterviewReview(
  review: GlassdoorInterviewReview,
): Promise<void> {
  await db.insert(schema.glassdoorInterviewReviews).values({
    id: review.id,
    company_id: review.company_id,
    role_title: review.role_title,
    difficulty: review.difficulty,
    overall_experience: review.overall_experience,
    interview_process: review.interview_process,
    questions: JSON.stringify(review.questions),
    tips: review.tips,
    offer_received: review.offer_received ? 1 : 0,
    scraped_at: review.scraped_at,
    created_at: review.created_at,
  });
}

export async function insertGlassdoorInterviewReviews(
  reviews: GlassdoorInterviewReview[],
): Promise<void> {
  for (const review of reviews) {
    await insertGlassdoorInterviewReview(review);
  }
}

export async function deleteGlassdoorInterviewReviewsByCompanyId(
  companyId: string,
): Promise<void> {
  await db
    .delete(schema.glassdoorInterviewReviews)
    .where(eq(schema.glassdoorInterviewReviews.company_id, companyId));
}

function mapGlassdoorInterviewReview(
  row: typeof schema.glassdoorInterviewReviews.$inferSelect,
): GlassdoorInterviewReview {
  return {
    id: row.id,
    company_id: row.company_id,
    role_title: row.role_title,
    difficulty: row.difficulty as GlassdoorInterviewReview["difficulty"],
    overall_experience: row.overall_experience as GlassdoorInterviewReview["overall_experience"],
    interview_process: row.interview_process,
    questions: safeJsonParse<string[]>(row.questions, []),
    tips: row.tips,
    offer_received: row.offer_received === 1,
    scraped_at: row.scraped_at,
    created_at: row.created_at,
  };
}

// --------------------------------------------------------------------------
// Utility
// --------------------------------------------------------------------------

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Re-export common Drizzle operators for convenience
export { eq, and, or, desc, asc, like, sql };
