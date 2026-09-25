import { invoke } from "@tauri-apps/api/core";

export interface WipeCounts {
  jobs: number;
  companies: number;
  applications: number;
  scrapeRuns: number;
  /** Subset of `jobs` the user pasted manually (source = 'manual'). */
  pastedJobs: number;
}

async function countRows(table: string, where = ""): Promise<number> {
  const result = await invoke<{ rows: unknown[][] }>("execute_sql", {
    sql: `SELECT COUNT(*) FROM ${table}${where ? ` WHERE ${where}` : ""}`,
    params: [],
  });
  const first = result.rows?.[0]?.[0];
  return typeof first === "number" ? first : Number(first ?? 0);
}

export async function previewWipeCounts(): Promise<WipeCounts> {
  const [jobs, companies, applications, scrapeRuns, pastedJobs] = await Promise.all([
    countRows("jobs"),
    countRows("companies"),
    countRows("applications"),
    countRows("scrape_runs"),
    countRows("jobs", "source = 'manual'"),
  ]);
  return { jobs, companies, applications, scrapeRuns, pastedJobs };
}

/**
 * Hard-delete all scraped job data plus everything that references it.
 *
 * Wiped: jobs (including pasted "manual" jobs), companies, scrape_runs, applications,
 * generated_cvs (job-bound), cover_letters (job-bound), match_analyses,
 * ats_reports (job-bound), interview_preps (via applications).
 *
 * Preserved: cvs — including tailored CVs, whose target_job_id / generated_cv_id may
 * dangle afterwards (plain columns, no FK) — settings, star_stories, ats_reports
 * without job_id.
 *
 * Order matters because of FK references — children before parents.
 */
export async function wipeJobsAndCompanies(): Promise<void> {
  const statements = [
    `DELETE FROM interview_preps WHERE application_id IN (SELECT id FROM applications)`,
    `DELETE FROM interviews WHERE application_id IN (SELECT id FROM applications)`,
    `DELETE FROM applications`,
    `DELETE FROM cover_letters`,
    `DELETE FROM generated_cvs`,
    `DELETE FROM match_analyses`,
    `DELETE FROM ats_reports WHERE job_id IS NOT NULL`,
    `DELETE FROM glassdoor_reviews`,
    `DELETE FROM glassdoor_interview_reviews`,
    `DELETE FROM scrape_runs`,
    `DELETE FROM jobs`,
    `DELETE FROM companies`,
  ];
  await invoke("execute_batch", { statements });
}
