/**
 * Apify "Advanced LinkedIn Job Search API" adapter
 * (https://apify.com/fantastic-jobs/advanced-linkedin-job-search-api), ported
 * from the retired Jobs Service (server/src/ingest/apify-linkedin-source.ts).
 *  - one paid actor run per ingest covers ALL title queries (titleSearch is an
 *    array), so the injected budget hook runs ONCE before the run — the paid
 *    unit is the run, not the page ($1.50/1k results, verified 2026-06-12)
 *  - remote-only via aiWorkArrangementFilter; DR eligibility is recorded
 *    downstream by the dr-filter as a flag
 *  - incremental: the run start time is persisted as a cursor and replayed as
 *    datePostedAfter (minus 1h overlap for the actor's indexing delay) so a
 *    window that was already bought is never bought again
 *  - keep recruiterOnly OFF — it triples the per-result price
 */

import type { CursorStore, JobSourceAdapter, Logger, RawSourceJob } from "./types";

const ACTOR_URL =
  "https://api.apify.com/v2/acts/fantastic-jobs~advanced-linkedin-job-search-api/run-sync-get-dataset-items";

const CURSOR_KEY = "apify-linkedin";
/** Re-cover this much of the window each run — the actor indexes with ~1h delay. */
const CURSOR_OVERLAP_MS = 3_600_000;

/**
 * Dataset item, field names per the actor README. Every field is optional and
 * type-checked at use — an upstream rename degrades to needs_recovery (with
 * raw_payload preserved) instead of a crash or a dropped job.
 */
export interface ApifyLinkedInItem {
  id?: string | number;
  title?: string;
  organization?: string;
  organization_url?: string;
  url?: string;
  external_apply_url?: string | null;
  date_posted?: string;
  locations_derived?: unknown[];
  location_type?: string;
  description_text?: string;
  employment_type?: unknown[];
  ai_salary_currency?: string;
  ai_salary_minvalue?: number;
  ai_salary_maxvalue?: number;
  ai_work_arrangement?: string;
  [key: string]: unknown;
}

export interface ApifyLinkedInSourceOptions {
  token: string;
  /** titleSearch terms; `:*` suffix enables prefix matching upstream. */
  titles: string[];
  /** Max results bought per run (actor minimum is 10, maximum 5000). */
  limit: number;
  cursors: CursorStore;
  /** Throws BudgetExceededError when the paid budget is exhausted. */
  consumeBudget: () => Promise<unknown>;
  log: Logger;
  fetchImpl?: typeof fetch;
  /** Defaults to remote-only. */
  workArrangements?: string[];
}

/** "2026-06-12T08:00:00" — UTC second precision, the format the actor expects. */
export function toActorTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/** Map one dataset item to the adapter-neutral raw shape. */
export function mapApifyItem(item: ApifyLinkedInItem): RawSourceJob {
  const workFromHome =
    item.location_type === "TELECOMMUTE" ||
    (typeof item.ai_work_arrangement === "string" &&
      item.ai_work_arrangement.startsWith("Remote"));

  // Keep every derived location: a multi-country posting must not look single-country
  // to the DR filter (and vice versa).
  const locations = Array.isArray(item.locations_derived)
    ? [...new Set(item.locations_derived.filter((l): l is string => typeof l === "string" && l.trim() !== ""))]
    : [];
  const firstEmployment = Array.isArray(item.employment_type) ? item.employment_type[0] : undefined;
  const postedMs = typeof item.date_posted === "string" ? Date.parse(item.date_posted) : Number.NaN;

  return {
    upstream_id: item.id === undefined || item.id === null ? "" : String(item.id),
    title: typeof item.title === "string" ? item.title : "",
    company_name: typeof item.organization === "string" ? item.organization : "",
    company_website: typeof item.organization_url === "string" ? item.organization_url : undefined,
    location: locations.join("; "),
    description: typeof item.description_text === "string" ? item.description_text : "",
    apply_url:
      (typeof item.external_apply_url === "string" && item.external_apply_url) ||
      (typeof item.url === "string" ? item.url : ""),
    source_url: typeof item.url === "string" ? item.url : undefined,
    salary_min: typeof item.ai_salary_minvalue === "number" ? item.ai_salary_minvalue : undefined,
    salary_max: typeof item.ai_salary_maxvalue === "number" ? item.ai_salary_maxvalue : undefined,
    salary_currency: typeof item.ai_salary_currency === "string" ? item.ai_salary_currency : undefined,
    // "FULL_TIME" → "full time", the shape the employment-type map expects.
    employment_type:
      typeof firstEmployment === "string"
        ? firstEmployment.toLowerCase().replace(/_/g, " ")
        : undefined,
    posted_at: Number.isFinite(postedMs) ? postedMs : undefined,
    work_from_home: workFromHome || undefined,
    raw_payload: JSON.stringify(item),
  };
}

export class ApifyLinkedInSource implements JobSourceAdapter {
  readonly name = "apify-linkedin";
  private readonly opts: ApifyLinkedInSourceOptions;

  constructor(opts: ApifyLinkedInSourceOptions) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const runStartedAt = Date.now();

    const saved = await this.opts.cursors.get(CURSOR_KEY);
    const lastRunIso = typeof saved?.last_run_iso === "string" ? saved.last_run_iso : undefined;
    const lastRunMs = lastRunIso ? Date.parse(lastRunIso) : Number.NaN;

    // Budget gate BEFORE the paid run (one unit = one actor run).
    await this.opts.consumeBudget();

    // Token travels in the Authorization header (Apify's recommendation), so
    // the URL is log-safe as-is.
    const url = new URL(ACTOR_URL);
    // Abort the actor (and its billing) if it ever runs away; normal runs at
    // our limits finish in well under a minute. run-sync's own cap is 300s.
    url.searchParams.set("timeout", "270");

    const input: Record<string, unknown> = {
      titleSearch: this.opts.titles,
      aiWorkArrangementFilter: this.opts.workArrangements ?? ["Remote OK", "Remote Solely"],
      descriptionType: "text",
      limit: this.opts.limit,
    };
    if (Number.isFinite(lastRunMs)) {
      input.datePostedAfter = toActorTimestamp(lastRunMs - CURSOR_OVERLAP_MS);
    }

    this.opts.log.info(
      { url: url.toString(), datePostedAfter: input.datePostedAfter, limit: this.opts.limit },
      "apify-linkedin: starting actor run"
    );

    let items: ApifyLinkedInItem[];
    try {
      const res = await fetchImpl(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new Error("unexpected non-array response from run-sync-get-dataset-items");
      }
      items = data as ApifyLinkedInItem[];
    } catch (err) {
      // Cursor untouched → the next run re-covers this window instead of
      // losing it. The budget unit stays spent — conservative accounting,
      // same as the SerpApi adapter.
      this.opts.log.error({ err }, "apify-linkedin: actor run failed");
      return;
    }

    for (const item of items) {
      yield mapApifyItem(item);
    }

    // Only a fully successful run advances the incremental window.
    await this.opts.cursors.set(CURSOR_KEY, {
      last_run_iso: new Date(runStartedAt).toISOString(),
    });
    this.opts.log.info({ jobs: items.length }, "apify-linkedin: actor run finished");
  }
}
