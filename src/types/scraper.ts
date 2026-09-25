// Scraping types: the in-app ingest pipeline (src/services/ingest/) logs its
// runs as ScrapeRun rows; the sidecar protocol below is CV parsing only.

export type ScrapeSource =
  | "aggregator"
  | "career_page"
  | "linkedin"
  // Legacy sources — kept for compatibility with rows persisted before the
  // browser-based scrapers were removed. No active source emits these.
  | "google_jobs"
  | "glassdoor";

export type ScrapeRunStatus = "queued" | "running" | "completed" | "failed";

export interface ScrapeCommand {
  action: "parse_cv";
  file_path?: string;
  file_type?: "pdf" | "docx";
  cv_id?: string;
}

export interface ScrapeResult {
  type: "cv_parsed" | "error" | "log";
  data: unknown;
}

export interface ScrapeRun {
  id: string;
  scraper_id: string;
  status: ScrapeRunStatus;
  jobs_found: number;
  jobs_new: number;
  /** Paid API units consumed by this run (SerpApi pages + Apify actor runs). */
  searches_used: number;
  error_message: string;
  started_at: number;
  completed_at: number | null;
}
