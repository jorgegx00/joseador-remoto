/**
 * Pluggable job-source adapter boundary, ported from the retired Jobs Service
 * (server/src/ingest/source.ts). Adding a new paid source means implementing
 * JobSourceAdapter and wiring it in run.ts — nothing downstream changes.
 */

/** Raw record as fetched from the upstream API, before mapping/filtering. */
export interface RawSourceJob {
  /** Upstream identifier (may be unstable; the mapper derives the stable external_id). */
  upstream_id: string;
  title: string;
  company_name: string;
  company_website?: string;
  location: string;
  description: string;
  apply_url: string;
  source_url?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  employment_type?: string;
  posted_at?: number;
  work_from_home?: boolean;
  /** Stable posting identity when known ("gh:123", "lever:<uuid>"): company boards. */
  canonical_key?: string;
  /** Verbatim upstream payload, preserved for LLM recovery when fields are missing. */
  raw_payload: string;
}

export interface JobSourceAdapter {
  /** Stable identifier recorded in scrape_runs.scraper_id. */
  readonly name: string;
  /**
   * Fetch a batch of raw jobs. Implementations paginate internally, persist
   * resume state via the cursor store, and call the injected budget hook
   * before every paid request (it throws when the budget is exhausted —
   * implementations let that propagate after saving their cursor).
   */
  fetch(): AsyncGenerator<RawSourceJob>;
}

/** Per-query resume state persisted in the ingest_cursors table. */
export interface CursorStore {
  get(key: string): Promise<Record<string, unknown> | null>;
  set(key: string, value: Record<string, unknown>): Promise<void>;
  clear(key: string): Promise<void>;
}

/** Minimal structured logger (replaces the server's FastifyBaseLogger). */
export interface Logger {
  info(data: unknown, msg: string): void;
  warn(data: unknown, msg: string): void;
  error(data: unknown, msg: string): void;
}

export const consoleLogger: Logger = {
  info: (data, msg) => console.info(`[ingest] ${msg}`, data),
  warn: (data, msg) => console.warn(`[ingest] ${msg}`, data),
  error: (data, msg) => console.error(`[ingest] ${msg}`, data),
};
